import { daysInMonth, parseDate } from "@/lib/invoice";

export type HomeTx = {
  id: string; type: "income" | "expense"; description: string; amount_cents: number; paid_amount_cents: number | null;
  status: string; competence_date: string; entity: string; method: string; category: string | null;
  installment: string | null; needsReview: boolean; receiptPath: string | null;
};

/** Valor que vale: o real pago quando existe, senão o previsto. */
export const effCents = (t: Pick<HomeTx, "amount_cents" | "paid_amount_cents" | "status">) =>
  t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : t.amount_cents;

export type Totals = { entradas: number; saidas: number; saldo: number; count: number };

/** Entradas, saídas e saldo dos lançamentos do mês (todos: cartão, pix, conta, pessoais e da empresa). */
export function monthTotals(txs: Pick<HomeTx, "type" | "amount_cents" | "paid_amount_cents" | "status">[]): Totals {
  let entradas = 0, saidas = 0;
  for (const t of txs) {
    if (t.type === "income") entradas += effCents(t);
    else saidas += effCents(t);
  }
  return { entradas, saidas, saldo: entradas - saidas, count: txs.length };
}

export type DayPoint = { day: number; label: string; saida: number; entrada: number };

/** Um ponto por dia do mês (dias sem lançamento ficam zerados), para o gráfico. */
export function dailyTotals(txs: Pick<HomeTx, "type" | "amount_cents" | "paid_amount_cents" | "status" | "competence_date">[], month: string): DayPoint[] {
  const { y, m } = parseDate(month);
  const days = Array.from({ length: daysInMonth(y, m) }, (_, i) => ({ day: i + 1, label: String(i + 1).padStart(2, "0"), saida: 0, entrada: 0 }));
  for (const t of txs) {
    if (t.competence_date.slice(0, 7) !== month.slice(0, 7)) continue;
    const d = days[Number(t.competence_date.slice(8, 10)) - 1];
    if (!d) continue;
    if (t.type === "income") d.entrada += effCents(t);
    else d.saida += effCents(t);
  }
  return days;
}
