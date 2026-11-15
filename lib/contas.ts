import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContaView } from "@/components/conta-row";
import { diffDays, monthEnd } from "@/lib/dates";
import { cashDateFor } from "@/lib/invoice";

type Tx = {
  id: string; type: "income" | "expense"; status: "forecast" | "pending" | "paid"; description: string;
  amount_cents: number; paid_amount_cents: number | null; cash_date: string; source: string;
  payment_method_id: string | null; entity_id: string;
};

export type Fatura = { id: string; nome: string; total: number; due: string | null };
export type ContasDoMes = {
  contas: ContaView[];
  faturas: Fatura[];
  aPagar: number; aReceber: number; pagoCents: number; recebidoCents: number;
  atrasadas: number;
};

/**
 * Contas do mês (por vencimento): o que ainda é obrigação (previsto/pendente) ou veio de recorrência.
 * Compra no cartão não entra uma a uma: ela compõe a fatura, listada à parte.
 */
export async function loadContasDoMes(supabase: SupabaseClient, mes: string, hoje: string): Promise<ContasDoMes> {
  const [txs, pms, ents, inv] = await Promise.all([
    supabase.from("transactions").select("id, type, status, description, amount_cents, paid_amount_cents, cash_date, source, payment_method_id, entity_id")
      .in("type", ["income", "expense"]).gte("cash_date", mes).lte("cash_date", monthEnd(mes)).order("cash_date"),
    supabase.from("payment_methods").select("id, name, kind, due_day"),
    supabase.from("entities").select("id, name"),
    supabase.from("v_card_invoices").select("payment_method_id, payment_method, total_cents").eq("invoice_month", mes),
  ]);
  const methods = new Map((pms.data ?? []).map((p) => [p.id as string, p as { id: string; name: string; kind: string; due_day: number | null }]));
  const ent = new Map((ents.data ?? []).map((e) => [e.id as string, e.name as string]));

  const contas: ContaView[] = ((txs.data ?? []) as Tx[])
    .filter((t) => methods.get(t.payment_method_id ?? "")?.kind !== "credit_card")
    .filter((t) => t.status !== "paid" || t.source === "recurring")
    .map((t) => {
      const paid = t.status === "paid";
      const kind = t.type === "income" ? "receber" : "pagar";
      const dias = diffDays(hoje, t.cash_date);
      const [label, tone] = paid
        ? [kind === "receber" ? "Recebido" : "Pago", "ok" as const]
        : dias < 0 ? [kind === "receber" ? "Atrasado" : "Vencida", "late" as const]
        : dias <= 7 ? [kind === "receber" ? "Recebe em breve" : "Vence em breve", "warn" as const]
        : [kind === "receber" ? "A receber" : "A pagar", "plain" as const];
      return {
        id: t.id, description: t.description, amount_cents: t.amount_cents, paid_amount_cents: t.paid_amount_cents,
        due: t.cash_date, kind, paid, label, tone,
        sub: `${ent.get(t.entity_id) ?? "—"}${t.payment_method_id ? ` · ${methods.get(t.payment_method_id)?.name ?? ""}` : ""}`,
      };
    });

  const soma = (f: (c: ContaView) => boolean, v: (c: ContaView) => number) => contas.filter(f).reduce((s, c) => s + v(c), 0);
  const faturas: Fatura[] = (inv.data ?? []).map((f) => {
    const m = methods.get(f.payment_method_id as string);
    return { id: f.payment_method_id as string, nome: f.payment_method as string, total: f.total_cents as number, due: m?.due_day ? cashDateFor(mes, m.due_day) : null };
  });

  return {
    contas, faturas,
    aPagar: soma((c) => c.kind === "pagar" && !c.paid, (c) => c.amount_cents),
    aReceber: soma((c) => c.kind === "receber" && !c.paid, (c) => c.amount_cents),
    pagoCents: soma((c) => c.kind === "pagar" && c.paid, (c) => c.paid_amount_cents ?? c.amount_cents),
    recebidoCents: soma((c) => c.kind === "receber" && c.paid, (c) => c.paid_amount_cents ?? c.amount_cents),
    atrasadas: contas.filter((c) => c.tone === "late").length,
  };
}
