import type { SupabaseClient } from "@supabase/supabase-js";
import { balanceAt, projectDays, virtualRecurring, type DailyFlow, type FlowDay } from "@/lib/cashflow";
import { monthStart } from "@/lib/dates";
import type { MethodInfo } from "@/lib/launch";
import type { RuleRow } from "@/lib/recurrence";

export type FlowData = {
  days: FlowDay[];
  opening: { cents: number; date: string | null };
};

const prevDay = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) - 1)).toISOString().slice(0, 10);

/**
 * Fluxo de caixa de `from` a `to`: o que já está lançado (parcelas, faturas, previstos) mais as
 * recorrências dos meses que o cron ainda não gerou. O saldo parte do saldo informado em Configurações.
 */
export async function loadFlow(supabase: SupabaseClient, from: string, to: string, today: string): Promise<FlowData> {
  const { data: st } = await supabase.from("org_settings").select("opening_balance_cents, opening_balance_date").maybeSingle();
  const opening = { cents: Number(st?.opening_balance_cents ?? 0), date: (st?.opening_balance_date as string | null) ?? null };

  const cumAt = async (date: string): Promise<number> => {
    const { data } = await supabase.from("v_cash_flow").select("cumulative_net_cents")
      .lte("cash_date", date).order("cash_date", { ascending: false }).limit(1);
    return Number(data?.[0]?.cumulative_net_cents ?? 0);
  };

  const [cumBefore, cumOpening, rows, rulesRes, existing] = await Promise.all([
    cumAt(prevDay(from)),
    opening.date ? cumAt(opening.date) : Promise.resolve(0),
    supabase.from("v_cash_flow").select("cash_date, inflow_cents, outflow_cents").gte("cash_date", from).lte("cash_date", to),
    supabase.from("recurring_rules").select("*").eq("active", true),
    supabase.from("transactions").select("external_id").eq("source", "recurring").gte("competence_date", from).lte("competence_date", to),
  ]);

  const rules = (rulesRes.data ?? []) as RuleRow[];
  const pmIds = [...new Set(rules.map((r) => r.payment_method_id).filter((x): x is string => !!x))];
  const { data: pms } = pmIds.length
    ? await supabase.from("payment_methods").select("id, kind, closing_day, due_day").in("id", pmIds)
    : { data: [] as MethodInfo[] };

  // só projeta de hoje em diante: o passado é o que está no banco
  const fromMonth = monthStart(from > today ? from : today);
  const virtual: DailyFlow[] = virtualRecurring({
    rules,
    methods: new Map((pms ?? []).map((p) => [p.id as string, p as MethodInfo])),
    existingKeys: new Set((existing.data ?? []).map((e) => e.external_id as string)),
    fromMonth,
    toMonth: monthStart(to),
  });

  const flows: DailyFlow[] = [
    ...(rows.data ?? []).map((r) => ({ date: r.cash_date as string, inflow: Number(r.inflow_cents), outflow: Number(r.outflow_cents) })),
    ...virtual,
  ];
  const base = balanceAt(opening, cumBefore, cumOpening);
  return { days: projectDays({ base, flows, from, to }), opening };
}
