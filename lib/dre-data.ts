import type { SupabaseClient } from "@supabase/supabase-js";
import type { DreInput } from "@/lib/dre";
import { monthEnd } from "@/lib/dates";

/** DRE: linhas da view, retiradas por mês e alíquota do Simples, para o intervalo de meses (dia 1) pedido. */
export async function loadDreInput(supabase: SupabaseClient, fromMonth: string, toMonth: string): Promise<DreInput> {
  const [dre, ret, st] = await Promise.all([
    supabase.from("v_dre_monthly").select("month, dre_line, income_cents, expense_cents").gte("month", fromMonth).lte("month", toMonth),
    supabase.from("v_settlements").select("month, amount_cents").eq("kind", "withdrawal").gte("month", fromMonth).lte("month", monthEnd(toMonth)),
    supabase.from("org_settings").select("simples_effective_rate").maybeSingle(),
  ]);
  const withdrawals: Record<string, number> = {};
  for (const r of ret.data ?? []) {
    const k = String(r.month).slice(0, 7);
    withdrawals[k] = (withdrawals[k] ?? 0) + Number(r.amount_cents);
  }
  return {
    rows: (dre.data ?? []).map((r) => ({ month: String(r.month), dre_line: String(r.dre_line), income_cents: Number(r.income_cents), expense_cents: Number(r.expense_cents) })),
    withdrawals,
    rate: st.data?.simples_effective_rate != null ? Number(st.data.simples_effective_rate) : null,
  };
}
