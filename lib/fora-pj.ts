import { norm } from "@/lib/sheet/extract";
import { addInvoiceMonths } from "@/lib/invoice";

export type OffTx = {
  id: string; description: string; amount_cents: number; paid_amount_cents: number | null; status: string;
  competence_date: string; payment_method_id: string;
};
export type OffGroup = { key: string; description: string; methodId: string; count: number; totalCents: number };

const eff = (t: OffTx) => (t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : t.amount_cents);
const inMonth = (t: OffTx, month: string) => t.competence_date.slice(0, 7) === month.slice(0, 7);

/** Total do mês de gastos da Aventure pagos em meios que não são da empresa. */
export function monthTotal(txs: OffTx[], month: string): number {
  return txs.filter((t) => inMonth(t, month)).reduce((s, t) => s + eff(t), 0);
}

/** Os últimos `n` meses terminando em `month`, do mais antigo ao mais novo, com o total de cada um. */
export function series(txs: OffTx[], month: string, n = 6): { month: string; cents: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const m = addInvoiceMonths(month, i - (n - 1));
    return { month: m, cents: monthTotal(txs, m) };
  });
}

/** Agrupa por descrição e meio: "Canva no Itaú" vira uma linha de trabalho, maior primeiro. */
export function groupOff(txs: OffTx[], month: string): OffGroup[] {
  const map = new Map<string, OffGroup>();
  for (const t of txs.filter((x) => inMonth(x, month))) {
    const key = `${norm(t.description)}|${t.payment_method_id}`;
    const g = map.get(key) ?? { key, description: t.description, methodId: t.payment_method_id, count: 0, totalCents: 0 };
    g.count += 1;
    g.totalCents += eff(t);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** A regra recorrente que gera esse gasto (para migrar de cartão com um clique). */
export function ruleFor<R extends { id: string; description: string; payment_method_id: string | null }>(rules: R[], g: OffGroup): R | null {
  return rules.find((r) => norm(r.description) === norm(g.description) && r.payment_method_id === g.methodId) ?? null;
}
