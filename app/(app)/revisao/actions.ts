"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ruleTextFrom } from "@/lib/classify/engine";
import { pendingMatching } from "@/lib/classify/review";
import { fitsEntity } from "@/lib/categories";
import { getCtx } from "@/lib/org";

const inputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  entity_id: z.uuid(),
  category_id: z.uuid().nullable(),
  remember: z.boolean(),
  matchText: z.string().max(80),
});
export type ResolveInput = z.infer<typeof inputSchema>;
export type ResolveResult = { ok: true; resolved: string[]; ruleCreated: boolean } | { ok: false; error: string };

/** Confirma a entidade (e a categoria) de um grupo; opcionalmente cria a regra e já resolve os outros pendentes parecidos. */
export async function resolveReview(raw: ResolveInput): Promise<ResolveResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };
  const { ids, entity_id, category_id, remember, matchText } = parsed.data;
  const { supabase, orgId } = await getCtx();

  const [{ data: ent }, { data: cat }, { data: txs }] = await Promise.all([
    supabase.from("entities").select("id, kind").eq("id", entity_id).maybeSingle(),
    category_id ? supabase.from("categories").select("id, applies_to, direction").eq("id", category_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("transactions").select("id, type").in("id", ids),
  ]);
  if (!ent) return { ok: false, error: "Entidade não encontrada." };
  if (category_id && !cat) return { ok: false, error: "Categoria não encontrada." };
  const type = txs?.[0]?.type as "expense" | "income" | undefined;
  if (!type || (txs ?? []).some((t) => t.type !== type)) return { ok: false, error: "Lançamentos não encontrados." };
  if (cat) {
    if (cat.direction !== (type === "income" ? "in" : "out")) return { ok: false, error: "Esta categoria é de " + (cat.direction === "in" ? "entrada" : "saída") + "." };
    if (!fitsEntity(cat.applies_to, ent.kind)) return { ok: false, error: "Esta categoria não vale para a entidade escolhida." };
  }

  const patch = { entity_id, category_id, needs_review: false, ai_suggestion: null };
  const upd = await supabase.from("transactions").update(patch).in("id", ids);
  if (upd.error) return { ok: false, error: "Não foi possível salvar. Tente de novo." };

  const resolved = new Set(ids);
  let ruleCreated = false;
  if (remember) {
    const text = ruleTextFrom(matchText);
    if (text.length < 3) return { ok: false, error: "O texto da regra precisa ter pelo menos 3 letras." };
    const { data: existing } = await supabase.from("classification_rules").select("id").eq("match_text", text).eq("match_kind", "contains").is("payment_method_id", null).maybeSingle();
    const ruleData = { entity_id, category_id };
    const r = existing
      ? await supabase.from("classification_rules").update(ruleData).eq("id", existing.id)
      : await supabase.from("classification_rules").insert({ org_id: orgId, match_text: text, match_kind: "contains", ...ruleData });
    ruleCreated = !r.error;
    if (ruleCreated) {
      // a regra já resolve os outros pendentes com o mesmo texto (mesma direção)
      const { data: pend } = await supabase.from("transactions").select("id, description, type").eq("needs_review", true).eq("type", type).limit(1000);
      const more = pendingMatching((pend ?? []) as { id: string; description: string }[], text).filter((i) => !resolved.has(i));
      for (let i = 0; i < more.length; i += 200) {
        const chunk = more.slice(i, i + 200);
        const u = await supabase.from("transactions").update(patch).in("id", chunk);
        if (!u.error) chunk.forEach((x) => resolved.add(x));
      }
    }
  }
  revalidatePath("/revisao");
  revalidatePath("/lancamentos");
  return { ok: true, resolved: [...resolved], ruleCreated };
}
