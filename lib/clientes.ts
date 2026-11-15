import { diffDays } from "@/lib/dates";
import { addInvoiceMonths } from "@/lib/invoice";

export type CTx = {
  id: string; client_id: string | null; description: string; amount_cents: number; paid_amount_cents: number | null;
  status: string; cash_date: string;
};
export type CRule = { id: string; client_id: string; amount_cents: number; day_of_month: number; start_month: string; end_month: string | null };
export type ClientRow = {
  id: string | null; name: string; expected: number; received: number; open: number;
  status: "recebido" | "a_receber" | "atrasado" | "nao_gerado";
  lateDays: number; dueDate: string | null; txs: CTx[]; rule: CRule | null;
};
export type ClientsSummary = {
  rows: ClientRow[]; expected: number; received: number; open: number; late: number;
  top: { name: string; pct: number } | null; ending: { name: string; end_month: string }[];
};

const received = (t: CTx) => (t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : 0);
const ORDER = { atrasado: 0, a_receber: 1, nao_gerado: 2, recebido: 3 } as const;
const active = (r: CRule, month: string) => r.start_month.slice(0, 7) <= month.slice(0, 7) && (!r.end_month || r.end_month.slice(0, 7) >= month.slice(0, 7));

/** Painel de clientes do mês: quanto era esperado, quanto entrou, quem está atrasado, concentração e contratos que terminam. */
export function summarizeClients(args: {
  clients: { id: string; name: string }[]; txs: CTx[]; rules: CRule[]; month: string; today: string;
}): ClientsSummary {
  const rows: ClientRow[] = [];
  const build = (id: string | null, name: string, txs: CTx[], rule: CRule | null): ClientRow | null => {
    if (txs.length === 0) {
      if (!rule || !active(rule, args.month)) return null; // sem cobrança neste mês
      return { id, name, expected: rule.amount_cents, received: 0, open: rule.amount_cents, status: "nao_gerado", lateDays: 0, dueDate: null, txs, rule };
    }
    const unpaid = txs.filter((t) => t.status !== "paid").sort((a, b) => (a.cash_date < b.cash_date ? -1 : 1));
    const expected = txs.reduce((s, t) => s + t.amount_cents, 0);
    const got = txs.reduce((s, t) => s + received(t), 0);
    const first = unpaid[0];
    const late = first ? diffDays(first.cash_date, args.today) : 0;
    return {
      id, name, expected, received: got, open: unpaid.reduce((s, t) => s + t.amount_cents, 0),
      status: !first ? "recebido" : late > 0 ? "atrasado" : "a_receber", lateDays: Math.max(0, late), dueDate: first?.cash_date ?? null, txs, rule,
    };
  };

  for (const c of args.clients) {
    const row = build(c.id, c.name, args.txs.filter((t) => t.client_id === c.id), args.rules.find((r) => r.client_id === c.id) ?? null);
    if (row) rows.push(row);
  }
  const avulso = build(null, "Sem cliente (avulsos)", args.txs.filter((t) => !t.client_id), null);
  if (avulso) rows.push(avulso);
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "pt-BR"));

  const named = rows.filter((r) => r.id);
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  const topRow = [...named].sort((a, b) => b.expected - a.expected)[0];
  const limit = addInvoiceMonths(args.month, 3).slice(0, 7);
  const ending = args.rules
    .filter((r) => r.end_month && r.end_month.slice(0, 7) >= args.month.slice(0, 7) && r.end_month.slice(0, 7) <= limit)
    .map((r) => ({ name: args.clients.find((c) => c.id === r.client_id)?.name ?? "—", end_month: r.end_month!.slice(0, 7) }))
    .sort((a, b) => (a.end_month < b.end_month ? -1 : 1));
  return {
    rows, expected, received: rows.reduce((s, r) => s + r.received, 0), open: rows.reduce((s, r) => s + r.open, 0),
    late: rows.filter((r) => r.status === "atrasado").length,
    top: topRow && expected > 0 ? { name: topRow.name, pct: Math.round((topRow.expected / expected) * 100) } : null, ending,
  };
}
