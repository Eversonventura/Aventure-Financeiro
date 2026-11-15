import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeAi, type Refs } from "@/lib/classify/ai";
import { haikuComplete } from "@/lib/classify/anthropic";
import { applyClassification, classifyBatch, THRESHOLD, type Classified, type Classifier, type Cls, type HistoryRow, type Item, type Rule } from "@/lib/classify/engine";
import { fitsEntity } from "@/lib/categories";
import { hasAnthropicKey } from "@/lib/sheet/anthropic";

export type Loaded = { classifier: Classifier; refs: Refs };

/** Regras, histórico confirmado e cadastros da organização do usuário (RLS), mais a IA se houver chave. */
export async function loadClassifier(supabase: SupabaseClient, opts: { ai?: boolean } = {}): Promise<Loaded> {
  const [rules, hist, ents, people, cats, pms] = await Promise.all([
    supabase.from("classification_rules").select("id, match_text, match_kind, payment_method_id, entity_id, category_id, person_id, hits"),
    supabase.from("transactions").select("description, entity_id, category_id, person_id").eq("needs_review", false).not("category_id", "is", null).order("created_at", { ascending: false }).limit(3000),
    supabase.from("entities").select("id, name, kind"),
    supabase.from("people").select("id, name"),
    supabase.from("categories").select("id, name, applies_to, direction"),
    supabase.from("payment_methods").select("id, name"),
  ]);
  const history = (hist.data ?? []) as HistoryRow[];
  const entName = new Map((ents.data ?? []).map((e) => [e.id as string, e.name as string]));
  const catName = new Map((cats.data ?? []).map((c) => [c.id as string, c.name as string]));
  const seen = new Set<string>();
  const examples: Refs["examples"] = [];
  for (const h of history) {
    const k = h.description.toLowerCase();
    if (seen.has(k) || examples.length >= 30) continue;
    seen.add(k);
    examples.push({ description: h.description, entity: entName.get(h.entity_id) ?? "", category: catName.get(h.category_id ?? "") ?? "" });
  }
  const refs: Refs = {
    entities: (ents.data ?? []) as Refs["entities"], people: (people.data ?? []) as Refs["people"],
    categories: (cats.data ?? []) as Refs["categories"], methods: (pms.data ?? []) as Refs["methods"], examples,
  };
  const useAi = (opts.ai ?? true) && hasAnthropicKey();
  return { refs, classifier: { rules: (rules.data ?? []) as Rule[], history, ai: useAi ? makeAi(refs, haikuComplete()) : undefined } };
}

/**
 * Classifica os itens. Com `learn`, conta o uso das regras e transforma em regra o texto
 * confirmado 3 vezes (histórico). Sem `learn` (sugestão enquanto a pessoa digita), não grava nada.
 */
export async function classifyItems(
  supabase: SupabaseClient, orgId: string, items: Item[], opts: { ai?: boolean; learn?: boolean; loaded?: Loaded } = {},
): Promise<{ results: Cls[]; loaded: Loaded }> {
  const loaded = opts.loaded ?? (await loadClassifier(supabase, { ai: opts.ai }));
  const results = await classifyBatch(items, loaded.classifier);
  if (opts.learn) {
    try {
      const used = new Map<string, number>();
      for (const r of results) if (r.ruleId) used.set(r.ruleId, (used.get(r.ruleId) ?? 0) + 1);
      for (const [id, n] of used) {
        const cur = loaded.classifier.rules.find((r) => r.id === id)?.hits ?? 0;
        await supabase.from("classification_rules").update({ hits: cur + n }).eq("id", id);
      }
      const auto = new Map<string, Cls>();
      for (const r of results) if (r.autoRule && !auto.has(r.autoRule.match_text)) auto.set(r.autoRule.match_text, r);
      const fresh = [...auto].filter(([text]) => !loaded.classifier.rules.some((r) => r.match_text === text && r.match_kind === "equals"));
      if (fresh.length) {
        await supabase.from("classification_rules").insert(fresh.map(([text, r]) => ({
          org_id: orgId, match_text: text, match_kind: "equals", entity_id: r.entity_id, category_id: r.category_id, person_id: r.person_id, hits: 1,
        })));
      }
    } catch (e) {
      console.error("aprendizado", e instanceof Error ? e.message : e); // aprender é bônus: não derruba o lançamento
    }
  }
  return { results, loaded };
}

/**
 * Lançamento rápido: a entidade que a pessoa escolheu é respeitada. A classificação só preenche a categoria
 * (se valer para a entidade e para a direção) quando a confiança é de 0,80 ou mais; abaixo disso guarda a
 * sugestão e deixa o lançamento na fila de revisão.
 */
export async function classifyLaunch(
  supabase: SupabaseClient, orgId: string, item: Item, entityId: string,
): Promise<Classified | null> {
  const { results, loaded } = await classifyItems(supabase, orgId, [item], { learn: true });
  const cls = results[0];
  if (cls.source === "none") return null;
  const ent = loaded.refs.entities.find((e) => e.id === entityId);
  const cat = loaded.refs.categories.find((c) => c.id === cls.category_id);
  const compatible = !!cat && cat.direction === (item.type === "income" ? "in" : "out") && fitsEntity(cat.applies_to, ent?.kind);
  if (cls.confidence >= THRESHOLD && compatible) {
    return { category_id: cls.category_id, person_id: item.person_id ?? cls.person_id, needs_review: false, ai_confidence: Math.round(cls.confidence * 100) / 100, ai_suggestion: null };
  }
  return applyClassification({ person_id: item.person_id }, { ...cls, confidence: Math.min(cls.confidence, THRESHOLD - 0.01) });
}
