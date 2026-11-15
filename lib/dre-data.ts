import type { SupabaseClient } from "@supabase/supabase-js";
import type { DreInput } from "@/lib/dre";
import { monthEnd } from "@/lib/dates";

/** DRE: linhas da view, retiradas por mês e alíquota do Simples, para o intervalo de meses (dia 1) pedido. */
export async function loadDreInput(supabase: SupabaseClient, fromMonth: string, toMonth: string, orgId?: string): Promise<DreInput> {
  // restringe à organização quando informada (o cron roda sem sessão de usuário, então não pode contar só com a RLS)
  const scope = <Q,>(q: Q): Q => (orgId ? (q as unknown as { eq: (c: string, v: string) => Q }).eq("org_id", orgId) : q);
  const [dre, ret, st] = await Promise.all([
    scope(supabase.from("v_dre_monthly").select("month, dre_line, income_cents, expense_cents").gte("month", fromMonth).lte("month", toMonth)),
    scope(supabase.from("v_settlements").select("month, amount_cents").eq("kind", "withdrawal").gte("month", fromMonth).lte("month", monthEnd(toMonth))),
    scope(supabase.from("org_settings").select("simples_effective_rate")).maybeSingle(),
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
