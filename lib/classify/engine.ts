import { norm } from "@/lib/sheet/extract";

export const THRESHOLD = 0.8; // confiança mínima para entrar sem passar pela fila

export type Rule = {
  id: string; match_text: string; match_kind: "contains" | "equals";
  payment_method_id: string | null; entity_id: string | null; category_id: string | null; person_id: string | null; hits: number;
};
export type HistoryRow = { description: string; entity_id: string; category_id: string | null; person_id: string | null };
export type Item = { description: string; amount_cents: number; payment_method_id: string | null; person_id: string | null; type: "expense" | "income" };

export type Cls = {
  entity_id: string | null; category_id: string | null; person_id: string | null;
  confidence: number; source: "rule" | "history" | "ai" | "none";
  ruleId?: string; // regra usada (para contar o uso)
  autoRule?: { match_text: string }; // histórico que vira regra automática
  question?: string | null;
};
export const NONE: Cls = { entity_id: null, category_id: null, person_id: null, confidence: 0, source: "none" };

/** Regra que vale para a descrição. Desempate: exata > contém, regra do meio > geral, texto mais longo, mais usada. */
export function findRule(rules: Rule[], description: string, pmId: string | null): Rule | null {
  const d = norm(description);
  const hits = rules.filter((r) => {
    if (r.payment_method_id && r.payment_method_id !== pmId) return false;
    const t = norm(r.match_text);
    if (!t) return false;
    return r.match_kind === "equals" ? d === t : d.includes(t);
  });
  hits.sort((a, b) =>
    Number(b.match_kind === "equals") - Number(a.match_kind === "equals") ||
    Number(!!b.payment_method_id) - Number(!!a.payment_method_id) ||
    b.match_text.length - a.match_text.length || b.hits - a.hits);
  return hits[0] ?? null;
}

/** O mesmo texto já confirmado 3 vezes com a mesma entidade e categoria vira regra automática. */
export function historyMatch(history: HistoryRow[], description: string): { entity_id: string; category_id: string; person_id: string | null } | null {
  const d = norm(description);
  const same = history.filter((h) => h.category_id && norm(h.description) === d);
  if (same.length < 3) return null;
  const first = same[0];
  if (!same.every((h) => h.entity_id === first.entity_id && h.category_id === first.category_id)) return null;
  const people = new Set(same.map((h) => h.person_id));
  return { entity_id: first.entity_id, category_id: first.category_id!, person_id: people.size === 1 ? first.person_id : null };
}

export type AiResult = { entity_id: string | null; category_id: string | null; person_id: string | null; confidence: number; question: string | null };
export type Classifier = {
  rules: Rule[];
  history: HistoryRow[];
  ai?: (items: Item[]) => Promise<(AiResult | null)[]>; // opcional: sem chave, só regras e histórico
};

/** Regra exata -> histórico -> Claude Haiku (em lote, uma chamada por descrição diferente). */
export async function classifyBatch(items: Item[], c: Classifier): Promise<Cls[]> {
  const out: Cls[] = items.map(() => NONE);
  const pending: number[] = [];
  items.forEach((it, i) => {
    const rule = findRule(c.rules, it.description, it.payment_method_id);
    if (rule) {
      out[i] = { entity_id: rule.entity_id, category_id: rule.category_id, person_id: rule.person_id, confidence: 1, source: "rule", ruleId: rule.id };
      return;
    }
    const h = historyMatch(c.history, it.description);
    if (h) {
      out[i] = { ...h, confidence: 1, source: "history", autoRule: { match_text: norm(it.description) } };
      return;
    }
    pending.push(i);
  });

  if (c.ai && pending.length > 0) {
    // o mesmo texto no mesmo meio é perguntado uma vez só
    const keyOf = (i: number) => `${norm(items[i].description)}|${items[i].payment_method_id ?? ""}|${items[i].type}`;
    const uniq = new Map<string, number>();
    for (const i of pending) if (!uniq.has(keyOf(i))) uniq.set(keyOf(i), i);
    const reps = [...uniq.values()];
    const answers = await c.ai(reps.map((i) => items[i]));
    const byKey = new Map<string, AiResult | null>();
    reps.forEach((i, n) => byKey.set(keyOf(i), answers[n] ?? null));
    for (const i of pending) {
      const a = byKey.get(keyOf(i));
      if (a && (a.entity_id || a.category_id)) out[i] = { ...a, source: "ai" };
    }
  }
  return out;
}

export type Classified = {
  entity_id?: string; category_id: string | null; person_id: string | null;
  needs_review: boolean; ai_confidence: number | null;
  ai_suggestion: { entity_id: string | null; category_id: string | null; person_id: string | null; question: string | null; source: string } | null;
};

/**
 * Aplica a classificação a um lançamento.
 * Confiança >= 0,80: entra direto. Abaixo: continua com a entidade padrão e sem categoria
 * (para não mexer no DRE), guarda a sugestão e vai para a fila de revisão.
 */
export function applyClassification(row: { person_id: string | null }, cls: Cls): Classified {
  if (cls.source === "none") return { category_id: null, person_id: row.person_id, needs_review: true, ai_confidence: null, ai_suggestion: null };
  if (cls.confidence >= THRESHOLD) {
    return {
      ...(cls.entity_id ? { entity_id: cls.entity_id } : {}),
      category_id: cls.category_id, person_id: row.person_id ?? cls.person_id,
      needs_review: cls.category_id == null && cls.entity_id == null, ai_confidence: Math.round(cls.confidence * 100) / 100, ai_suggestion: null,
    };
  }
  return {
    category_id: null, person_id: row.person_id, needs_review: true, ai_confidence: Math.round(cls.confidence * 100) / 100,
    ai_suggestion: { entity_id: cls.entity_id, category_id: cls.category_id, person_id: cls.person_id, question: cls.question ?? null, source: cls.source },
  };
}

/** Texto que a regra deve procurar: a descrição sem o "n/N" das parcelas, normalizada. */
export function ruleTextFrom(description: string): string {
  return norm(description).replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, "").replace(/\s+/g, " ").trim();
}
