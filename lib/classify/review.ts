import { norm } from "@/lib/sheet/extract";
import { ruleTextFrom } from "@/lib/classify/engine";

export type PendingTx = {
  id: string; description: string; amount_cents: number; type: "expense" | "income"; competence_date: string;
  payment_method_id: string | null; entity_id: string; ai_confidence: number | null;
  ai_suggestion: { entity_id: string | null; category_id: string | null; question: string | null; source: string } | null;
};
export type ReviewGroup = {
  key: string; description: string; type: "expense" | "income"; ids: string[]; count: number; totalCents: number;
  payment_method_id: string | null; suggestion: PendingTx["ai_suggestion"]; confidence: number | null; ruleText: string; firstDate: string;
};

/** Agrupa a fila por texto: "Estes 9 itens de mercado são da Casa?" vira uma pergunta só. */
export function groupForReview(txs: PendingTx[]): ReviewGroup[] {
  const map = new Map<string, ReviewGroup>();
  for (const t of txs) {
    const key = `${ruleTextFrom(t.description)}|${t.type}`;
    const g = map.get(key) ?? {
      key, description: t.description, type: t.type, ids: [], count: 0, totalCents: 0, payment_method_id: t.payment_method_id,
      suggestion: t.ai_suggestion, confidence: t.ai_confidence, ruleText: ruleTextFrom(t.description), firstDate: t.competence_date,
    };
    g.ids.push(t.id);
    g.count += 1;
    g.totalCents += t.amount_cents;
    if (!g.suggestion && t.ai_suggestion) { g.suggestion = t.ai_suggestion; g.confidence = t.ai_confidence; }
    if (t.competence_date > g.firstDate) g.firstDate = t.competence_date;
    map.set(key, g);
  }
  // mais itens primeiro: uma resposta resolve mais
  return [...map.values()].sort((a, b) => b.count - a.count || (a.description < b.description ? -1 : 1));
}

/** Itens pendentes que uma regra "contém X" resolve de uma vez. */
export function pendingMatching(txs: { id: string; description: string }[], matchText: string): string[] {
  const t = norm(matchText);
  return t ? txs.filter((x) => norm(x.description).includes(t)).map((x) => x.id) : [];
}
