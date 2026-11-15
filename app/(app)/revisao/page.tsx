import { ReviewDeck, type DeckGroup } from "@/components/review-deck";
import { groupForReview, type PendingTx } from "@/lib/classify/review";
import { getCtx } from "@/lib/org";

export default async function Page() {
  const { supabase } = await getCtx();
  const [txs, ents, cats, pms] = await Promise.all([
    supabase.from("transactions").select("id, description, amount_cents, type, competence_date, payment_method_id, entity_id, ai_confidence, ai_suggestion")
      .eq("needs_review", true).in("type", ["expense", "income"]).order("competence_date", { ascending: false }).limit(1000),
    supabase.from("entities").select("id, name, kind").order("name"),
    supabase.from("categories").select("id, name, applies_to, direction").order("name"),
    supabase.from("payment_methods").select("id, name"),
  ]);
  const method = new Map((pms.data ?? []).map((m) => [m.id as string, m.name as string]));
  const groups: DeckGroup[] = groupForReview((txs.data ?? []) as PendingTx[]).map((g) => ({
    key: g.key, description: g.description, type: g.type, ids: g.ids, count: g.count, totalCents: g.totalCents,
    method: g.payment_method_id ? method.get(g.payment_method_id) ?? null : null, ruleText: g.ruleText, firstDate: g.firstDate,
    confidence: g.confidence, suggestion: g.suggestion,
  }));
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Revisão</h1>
      <p className="text-muted">Itens que a IA não teve certeza de classificar. Responda uma vez e, se quiser, o sistema aprende.</p>
      <ReviewDeck initial={groups} entities={(ents.data ?? []) as never} categories={(cats.data ?? []) as never} />
    </div>
  );
}
