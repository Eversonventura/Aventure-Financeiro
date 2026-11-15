import { norm } from "@/lib/sheet/extract";
import { applyClassification, NONE, type Cls, type Item } from "@/lib/classify/engine";
import type { Plan } from "@/lib/sheet/plan";

export const MAX_AI_ITEMS = 200; // teto de descrições diferentes enviadas à IA por importação

/** Classifica os lançamentos do plano de importação; o resto fica na fila de revisão. */
export async function classifyPlan(plan: Plan, classify: (items: Item[]) => Promise<Cls[]>): Promise<{ plan: Plan; classified: number }> {
  const key = (t: { description: string; payment_method_id: string | null; type: string }) => `${norm(t.description)}|${t.payment_method_id ?? ""}|${t.type}`;
  const reps = new Map<string, Item>();
  for (const t of plan.txs) {
    if (!reps.has(key(t))) reps.set(key(t), { description: t.description, amount_cents: t.amount_cents, payment_method_id: t.payment_method_id, person_id: t.person_id, type: t.type });
  }
  const keys = [...reps.keys()];
  const sent = keys.slice(0, MAX_AI_ITEMS);
  const answers = sent.length ? await classify(sent.map((k) => reps.get(k)!)) : [];
  const byKey = new Map<string, Cls>(sent.map((k, i) => [k, answers[i] ?? NONE]));

  let classified = 0;
  for (const t of plan.txs) {
    const cls = byKey.get(key(t)) ?? NONE;
    const c = applyClassification({ person_id: t.person_id }, cls);
    t.category_id = c.category_id;
    t.person_id = c.person_id;
    t.needs_review = c.needs_review || c.category_id == null;
    t.ai_confidence = c.ai_confidence;
    t.ai_suggestion = c.ai_suggestion;
    if (c.entity_id) t.entity_id = c.entity_id;
    if (!t.needs_review) classified++;
  }
  for (const r of plan.rules) {
    const first = plan.txs.find((t) => t.recurring_rule_id === r.id);
    if (first && !first.needs_review) { r.category_id = first.category_id; r.entity_id = first.entity_id; }
  }
  return { plan, classified };
}
