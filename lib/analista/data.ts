import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAggregates, type Aggregates, type CatInfo, type Names, type TxRow } from "@/lib/analista/calc";
import type { ChatDeps, FlowMonth } from "@/lib/analista/chat";
import type { Report } from "@/lib/analista/report";
import { buildReportUser, parseReport, REPORT_SYSTEM } from "@/lib/analista/report";
import { byMonth } from "@/lib/cashflow";
import { summarizeClients, type CRule, type CTx } from "@/lib/clientes";
import { monthEnd, monthStart } from "@/lib/dates";
import { dreTable } from "@/lib/dre";
import { loadDreInput } from "@/lib/dre-data";
import { loadFlow } from "@/lib/flow-data";
import { monthTotal, type OffTx } from "@/lib/fora-pj";
import { addInvoiceMonths } from "@/lib/invoice";

// Toda consulta leva `org_id` explícito: o cron roda sem sessão de usuário, então não pode contar só com a RLS.

export type Refs = { cats: CatInfo; entities: Names; people: Names; methods: Names };

export async function loadRefs(s: SupabaseClient, orgId: string): Promise<Refs> {
  const [c, e, p, m] = await Promise.all([
    s.from("categories").select("id, name, nature").eq("org_id", orgId),
    s.from("entities").select("id, name").eq("org_id", orgId),
    s.from("people").select("id, name").eq("org_id", orgId),
    s.from("payment_methods").select("id, name").eq("org_id", orgId),
  ]);
  const names = (l: { data: { id: string; name: string }[] | null }): Names => new Map((l.data ?? []).map((x) => [x.id, x.name]));
  return {
    cats: new Map(((c.data ?? []) as { id: string; name: string; nature: string | null }[]).map((x) => [x.id, { name: x.name, nature: x.nature }])),
    entities: names(e), people: names(p), methods: names(m),
  };
}

/** Lançamentos por data de competência (sem os que são só transferência entre contas). */
export async function loadRows(s: SupabaseClient, orgId: string, from: string, to: string): Promise<TxRow[]> {
  const out: TxRow[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await s.from("transactions")
      .select("type, status, description, amount_cents, paid_amount_cents, competence_date, entity_id, person_id, category_id, payment_method_id")
      .eq("org_id", orgId).in("type", ["income", "expense"]).gte("competence_date", from).lte("competence_date", to).range(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as TxRow[]));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

/** Os dados do mês (dia 1) já resumidos: o que o Opus recebe. */
export async function buildMonthAggregates(s: SupabaseClient, orgId: string, month: string, today: string): Promise<Aggregates> {
  const refs = await loadRefs(s, orgId);
  const from = addInvoiceMonths(month, -3);
  const cur = monthStart(today);
  const [rows, dreInput, rules, flow, review, pj, commit] = await Promise.all([
    loadRows(s, orgId, from, monthEnd(month)),
    loadDreInput(s, from, month, orgId),
    s.from("recurring_rules").select("description, amount_cents, entity_id, payment_method_id").eq("org_id", orgId).eq("active", true).eq("direction", "out"),
    loadFlow(s, cur, monthEnd(addInvoiceMonths(cur, 5)), today, orgId),
    s.from("transactions").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("needs_review", true),
    s.from("entities").select("id, kind").eq("org_id", orgId),
    s.from("transactions").select("amount_cents").eq("org_id", orgId).not("commitment_id", "is", null).neq("status", "paid").gte("cash_date", cur).lte("cash_date", monthEnd(cur)),
  ]);

  const pjIds = (pj.data ?? []).filter((e) => e.kind === "pj").map((e) => e.id as string);
  const kind = new Map((pj.data ?? []).map((e) => [e.id as string, e.kind as string]));

  // clientes atrasados e concentração (mês corrente)
  const [clients, ctxs, crules] = await Promise.all([
    s.from("clients").select("id, name").eq("org_id", orgId).eq("active", true),
    pjIds.length ? s.from("transactions").select("id, client_id, description, amount_cents, paid_amount_cents, status, cash_date").eq("org_id", orgId).eq("type", "income").in("entity_id", pjIds).gte("cash_date", cur).lte("cash_date", monthEnd(cur)) : Promise.resolve({ data: [] }),
    s.from("recurring_rules").select("id, client_id, amount_cents, day_of_month, start_month, end_month").eq("org_id", orgId).eq("active", true).eq("direction", "in").not("client_id", "is", null),
  ]);
  const cs = summarizeClients({ clients: (clients.data ?? []) as { id: string; name: string }[], txs: (ctxs.data ?? []) as CTx[], rules: (crules.data ?? []) as CRule[], month: cur, today });

  // gastos da Aventure em meio que não é da empresa
  const { data: pms } = await s.from("payment_methods").select("id, owner_entity_id").eq("org_id", orgId);
  const off = (pms ?? []).filter((m) => kind.get(m.owner_entity_id as string) !== "pj").map((m) => m.id as string);
  const { data: offTx } = pjIds.length && off.length
    ? await s.from("transactions").select("id, description, amount_cents, paid_amount_cents, status, competence_date, payment_method_id").eq("org_id", orgId).eq("type", "expense").in("entity_id", pjIds).in("payment_method_id", off).gte("competence_date", month).lte("competence_date", monthEnd(month))
    : { data: [] };

  return buildAggregates({
    month, dreInput, rows: rows, ...refs,
    rules: ((rules.data ?? []) as { description: string; amount_cents: number; entity_id: string; payment_method_id: string | null }[]),
    extras: {
      meses_negativos: byMonth(flow.days).filter((b) => b.negative).map((b) => ({ mes: b.key, saldo_minimo_cents: b.minBalance })),
      clientes_atrasados: cs.rows.filter((r) => r.status === "atrasado").map((r) => ({ nome: r.name, dias: r.lateDays, valor_cents: r.open })),
      maior_cliente: cs.top ? { nome: cs.top.name, pct: cs.top.pct } : null,
      gastos_da_aventure_fora_do_pj_cents: monthTotal((offTx ?? []) as OffTx[], month),
      lancamentos_para_revisar: review.count ?? 0,
      parcelas_de_emprestimos_e_consorcios_por_mes_cents: (commit.data ?? []).reduce((sum, t) => sum + Number(t.amount_cents), 0),
    },
  });
}

export type ReportGenerator = (system: string, user: string) => Promise<string>;

/** Gera (ou substitui) o relatório do mês e guarda em ai_insights. */
export async function generateMonthlyReport(s: SupabaseClient, orgId: string, month: string, today: string, opus: ReportGenerator, model: string): Promise<Report> {
  const agg = await buildMonthAggregates(s, orgId, month, today);
  const report = parseReport(await opus(REPORT_SYSTEM, buildReportUser(agg)));
  const content = { report, model, generated_at: new Date().toISOString() };
  const { data: old } = await s.from("ai_insights").select("id").eq("org_id", orgId).eq("period_month", month).eq("kind", "monthly_report").limit(1).maybeSingle();
  const { error } = old
    ? await s.from("ai_insights").update({ content, created_at: new Date().toISOString() }).eq("id", old.id)
    : await s.from("ai_insights").insert({ org_id: orgId, period_month: month, kind: "monthly_report", content });
  if (error) throw new Error(`relatório: ${error.message}`);
  return report;
}

/** Consultas que o chat pode usar (as ferramentas de leitura), sempre dentro da organização. */
export async function chatDeps(s: SupabaseClient, orgId: string, today: string): Promise<ChatDeps> {
  const refs = await loadRefs(s, orgId);
  return {
    ...refs,
    getRows: (from, to) => loadRows(s, orgId, from, to),
    getDre: async (month) => {
      const input = await loadDreInput(s, addInvoiceMonths(month, -3), month, orgId);
      const t = dreTable(input, month);
      return { mes: month.slice(0, 7), linhas: t.rows.map((r) => ({ linha: r.label, valor_cents: r.value, mes_anterior_cents: r.prev, media_3_meses_cents: r.avg3, pct_da_receita: r.pct })) };
    },
    getFlow: async (months): Promise<FlowMonth[]> => {
      const cur = monthStart(today);
      const flow = await loadFlow(s, cur, monthEnd(addInvoiceMonths(cur, months - 1)), today, orgId);
      return byMonth(flow.days).map((b) => ({ mes: b.key, entradas_cents: b.inflow, saidas_cents: b.outflow, saldo_final_cents: b.endBalance, saldo_minimo_cents: b.minBalance }));
    },
  };
}
