import Link from "next/link";
import { MonthlyChart } from "@/components/charts";
import { byMonth } from "@/lib/cashflow";
import { loadContasDoMes } from "@/lib/contas";
import { monthEnd, monthLabel, monthStart, todayFortaleza } from "@/lib/dates";
import { loadFlow } from "@/lib/flow-data";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";
import { monthMetrics, series12, type Alert, type DreRow } from "@/lib/painel";

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(hoje);
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);
  const atual = monthStart(hoje);

  const { supabase } = await getCtx();
  const flowFrom = mes < atual ? mes : atual;
  const flowTo = monthEnd(addInvoiceMonths(mes > atual ? mes : atual, mes > atual ? 0 : 5));

  const [dre, ret, flow, contas, rev, cartoes] = await Promise.all([
    supabase.from("v_dre_monthly").select("month, dre_line, amount_cents").gte("month", addInvoiceMonths(mes, -11)).lte("month", mes),
    supabase.from("v_settlements").select("amount_cents").eq("month", mes).eq("kind", "withdrawal"),
    loadFlow(supabase, flowFrom, flowTo, hoje),
    loadContasDoMes(supabase, atual, hoje),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
    supabase.from("payment_methods").select("id").eq("kind", "credit_card").eq("active", true).or("closing_day.is.null,due_day.is.null"),
  ]);

  const rows = ((dre.data ?? []) as { month: string; dre_line: string; amount_cents: number | string }[])
    .map((r): DreRow => ({ month: r.month, dre_line: r.dre_line, amount_cents: Number(r.amount_cents) }));
  const m = monthMetrics(rows, mes);
  const serie = series12(rows, mes);
  const retiradas = (ret.data ?? []).reduce((s, r) => s + Number(r.amount_cents), 0) + m.distribuicao;
  const margem = m.receita > 0 ? Math.round((m.resultado / m.receita) * 100) : null;

  const meses = byMonth(flow.days);
  const fimDoMes = flow.days.find((d) => d.date === monthEnd(mes));
  const negativo = byMonth(flow.days.filter((d) => d.date >= hoje)).find((b) => b.negative);

  const alertas: Alert[] = [];
  if (negativo) alertas.push({ tone: "late", text: `Saldo previsto fica negativo em ${negativo.label} (mínimo ${centsToBRL(negativo.minBalance)}).`, href: "/fluxo" });
  if (contas.atrasadas > 0) alertas.push({ tone: "late", text: `${contas.atrasadas} conta(s) vencida(s) neste mês.`, href: "/contas" });
  if ((rev.count ?? 0) > 0) alertas.push({ tone: "warn", text: `${rev.count} lançamento(s) sem categoria não entram no DRE.`, href: "/revisao" });
  if ((cartoes.data ?? []).length > 0) alertas.push({ tone: "warn", text: `${cartoes.data?.length} cartão(ões) sem fechamento/vencimento definidos.`, href: "/configuracoes/meios" });
  if (!flow.opening.date) alertas.push({ tone: "plain", text: "Informe o saldo em contas para o fluxo de caixa projetado.", href: "/configuracoes/geral" });

  const cards = [
    { nome: "Receita", valor: centsToBRL(m.receita), sub: "Aventure, por competência" },
    { nome: "Despesa", valor: centsToBRL(m.despesa), sub: "Inclui impostos e rateio da casa" },
    { nome: "Resultado", valor: centsToBRL(m.resultado), sub: margem == null ? "Sem receita no mês" : `Margem de ${margem}%`, neg: m.resultado < 0 },
    { nome: "Retiradas", valor: centsToBRL(retiradas), sub: "Gastos pessoais pagos pela Aventure e distribuição" },
    { nome: "Saldo projetado", valor: fimDoMes ? centsToBRL(fimDoMes.balance) : "—", sub: "Em caixa no fim do mês", neg: (fimDoMes?.balance ?? 0) < 0 },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Painel</h1>
        <div className="flex items-center gap-3">
          <Link href={`/painel?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Mês anterior">‹</Link>
          <span className="min-w-36 text-center font-medium capitalize">{monthLabel(mes)}</span>
          <Link href={`/painel?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próximo mês">›</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.nome} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm text-muted">{c.nome}</div>
            <div className={`mt-1 font-heading text-2xl font-bold ${c.neg ? "text-red-400" : ""}`}>{c.valor}</div>
            <div className="mt-1 text-xs text-muted">{c.sub}</div>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Últimos 12 meses</h2>
        <MonthlyChart data={serie} />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">Ver em tabela</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-1 pr-4">Mês</th><th className="pr-4 text-right">Receita</th><th className="pr-4 text-right">Despesa</th><th className="text-right">Resultado</th></tr></thead>
              <tbody>
                {serie.map((s) => (
                  <tr key={s.month} className="border-t border-line"><td className="py-1 pr-4">{s.label}</td><td className="pr-4 text-right">{centsToBRL(s.receita)}</td><td className="pr-4 text-right">{centsToBRL(s.despesa)}</td><td className="text-right">{centsToBRL(s.resultado)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-semibold">Alertas</h2>
          {alertas.length === 0 ? <p className="text-muted">Nada fora do normal. 🎉</p> : (
            <ul className="flex flex-col gap-2">
              {alertas.map((a) => (
                <li key={a.text} className={`rounded-xl px-3 py-2 text-sm ${a.tone === "late" ? "bg-red-500/10 text-red-300" : a.tone === "warn" ? "bg-amber-400/10 text-amber-300" : "bg-surface-2 text-muted"}`}>
                  {a.href ? <Link href={a.href} className="underline-offset-2 hover:underline">{a.text}</Link> : a.text}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-semibold">Saldo previsto por mês</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {meses.slice(0, 6).map((b) => (
              <li key={b.key} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                <span>{b.label}</span>
                <span className={b.negative ? "font-semibold text-red-400" : "font-medium"}>{centsToBRL(b.endBalance)}</span>
              </li>
            ))}
          </ul>
          <Link href="/fluxo" className="mt-3 inline-block text-sm font-medium text-gold underline">Abrir fluxo de caixa</Link>
        </div>
      </section>
    </div>
  );
}
