import Link from "next/link";
import { BalanceChart } from "@/components/charts";
import { byMonth, byWeek, type Bucket } from "@/lib/cashflow";
import { monthEnd, monthStart, todayFortaleza } from "@/lib/dates";
import { loadFlow } from "@/lib/flow-data";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";

export default async function Page({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const { vis } = await searchParams;
  const modo = vis === "dia" ? "dia" : "semana";
  const hoje = todayFortaleza();
  const from = monthStart(hoje);
  const to = monthEnd(addInvoiceMonths(from, 5));

  const { supabase } = await getCtx();
  const flow = await loadFlow(supabase, from, to, hoje);

  const meses = byMonth(flow.days);
  const negativos = meses.filter((m) => m.negative);
  const linhas: Bucket[] = modo === "semana"
    ? byWeek(flow.days)
    : flow.days.filter((d) => d.inflow > 0 || d.outflow > 0).map((d) => ({
        key: d.date, label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`, inflow: d.inflow, outflow: d.outflow,
        net: d.net, endBalance: d.balance, minBalance: d.balance, negative: d.balance < 0,
      }));
  const chart = flow.days.map((d) => ({ date: d.date, label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`, balance: d.balance }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Fluxo de caixa</h1>
        <p className="text-muted">Projeção de 6 meses com parcelas, faturas, contas fixas e recebimentos já previstos.</p>
      </div>

      {!flow.opening.date && (
        <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
          O saldo parte de zero, porque você ainda não informou quanto há nas contas.{" "}
          <Link href="/configuracoes/geral" className="font-medium underline">Informar saldo</Link>
        </p>
      )}
      {negativos.length > 0 && (
        <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
          Atenção: o saldo previsto fica negativo em {negativos.map((m) => m.label).join(", ")}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {meses.slice(0, 6).map((m) => (
          <div key={m.key} className={`rounded-2xl border p-4 ${m.negative ? "border-red-400/50 bg-red-500/10" : "border-line bg-surface"}`}>
            <div className="text-sm text-muted">{m.label}</div>
            <div className={`mt-1 font-heading text-xl font-bold ${m.negative ? "text-red-300" : ""}`}>{centsToBRL(m.endBalance)}</div>
            <div className="mt-2 text-xs text-muted">entra {centsToBRL(m.inflow)}</div>
            <div className="text-xs text-muted">sai {centsToBRL(m.outflow)}</div>
          </div>
        ))}
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Saldo previsto</h2>
        <BalanceChart data={chart} />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{modo === "semana" ? "Semana a semana" : "Dia a dia"}</h2>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
            <Link href="/fluxo?vis=semana" className={`rounded-md px-3 py-1 ${modo === "semana" ? "bg-brand text-white" : "text-muted"}`}>Semana</Link>
            <Link href="/fluxo?vis=dia" className={`rounded-md px-3 py-1 ${modo === "dia" ? "bg-brand text-white" : "text-muted"}`}>Dia</Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-1 pr-4">{modo === "semana" ? "Semana de" : "Dia"}</th><th className="pr-4 text-right">Entra</th><th className="pr-4 text-right">Sai</th><th className="text-right">Saldo</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.key} className="border-t border-line">
                  <td className="py-1.5 pr-4">{l.label}</td>
                  <td className="pr-4 text-right text-emerald-300">{l.inflow ? centsToBRL(l.inflow) : "—"}</td>
                  <td className="pr-4 text-right">{l.outflow ? centsToBRL(l.outflow) : "—"}</td>
                  <td className={`text-right font-medium ${l.endBalance < 0 ? "text-red-400" : ""}`}>{centsToBRL(l.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhas.length === 0 && <p className="py-4 text-muted">Nada previsto neste período.</p>}
        </div>
      </section>
    </div>
  );
}
