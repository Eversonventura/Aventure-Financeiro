import Link from "next/link";
import { DailyChart } from "@/components/charts";
import { Orbits } from "@/components/orbits";
import { TxList } from "@/components/tx-list";
import { monthTitle } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import type { DayPoint, HomeTx, Totals } from "@/lib/inicio";

export type InicioData = {
  mes: string; // AAAA-MM-01
  totals: Totals;
  daily: DayPoint[];
  txs: HomeTx[];
  hasMore: boolean;
  aPagar: number; aReceber: number; atrasadas: number; revisar: number;
};

/** Início: o mês em números, um gráfico por dia e a tabela de todos os lançamentos. No celular não tem banner. */
export function InicioView({ mes, totals, daily, txs, hasMore, aPagar, aReceber, atrasadas, revisar }: InicioData) {
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);
  return (
    <div className="md:-mx-11 md:-my-8">
      {/* banner: só no computador */}
      <section className="relative hidden overflow-hidden border-b border-line px-11 py-12 md:block">
        <Orbits className="top-0 right-0 h-full w-3/4" />
        <div className="relative max-w-2xl">
          <h1 className="font-heading text-5xl leading-[1.05] font-bold">Bem-vindo ao<br />Aventure Financeiro</h1>
          <p className="mt-3 max-w-xl text-lg text-muted">Lance em segundos e acompanhe o mês: tudo o que entrou e saiu, no caixa único da família e da empresa.</p>
        </div>
      </section>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 md:px-11 md:py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold md:hidden">Início</h1>
          <h2 className="hidden text-xl font-semibold md:block">Lançamentos do mês</h2>
          <div className="flex items-center gap-2">
            <Link href={`/?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Mês anterior">‹</Link>
            <span className="min-w-28 text-center text-sm font-medium">{monthTitle(mes)}</span>
            <Link href={`/?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próximo mês">›</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
          <div className="rounded-2xl border border-line bg-surface p-3 md:p-4">
            <div className="text-xs text-muted md:text-sm">Entradas</div>
            <div className="mt-1 font-heading text-xl font-bold whitespace-nowrap text-emerald-300 md:text-2xl">{centsToBRL(totals.entradas)}</div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-3 md:p-4">
            <div className="text-xs text-muted md:text-sm">Saídas</div>
            <div className="mt-1 font-heading text-xl font-bold whitespace-nowrap md:text-2xl">{centsToBRL(totals.saidas)}</div>
          </div>
          <div className="col-span-2 rounded-2xl border border-line bg-surface p-3 md:col-span-1 md:p-4">
            <div className="text-xs text-muted md:text-sm">Saldo do mês</div>
            <div className={`mt-1 font-heading text-xl font-bold whitespace-nowrap md:text-2xl ${totals.saldo < 0 ? "text-red-400" : ""}`}>{centsToBRL(totals.saldo)}</div>
          </div>
        </div>

        {(aPagar > 0 || aReceber > 0 || revisar > 0) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {aPagar > 0 && <Link href="/contas" className="hover:underline">A pagar {centsToBRL(aPagar)}{atrasadas > 0 ? ` (${atrasadas} vencida${atrasadas > 1 ? "s" : ""})` : ""}</Link>}
            {aReceber > 0 && <Link href="/contas" className="hover:underline">A receber {centsToBRL(aReceber)}</Link>}
            {revisar > 0 && <Link href="/revisao" className="text-gold hover:underline">{revisar} para revisar</Link>}
          </p>
        )}

        <section className="rounded-3xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Por dia</h2>
          {totals.count === 0 ? <p className="py-6 text-center text-muted">Nenhum lançamento neste mês.</p> : <DailyChart data={daily} />}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lançamentos <span className="font-normal text-muted">({totals.count})</span></h2>
            <Link href="/lancamentos/novo" className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-canvas">Novo</Link>
          </div>
          {txs.length === 0 ? <p className="text-muted">Toque em “Novo” (ou no +) para fazer o primeiro lançamento.</p> : <TxList txs={txs} />}
          {hasMore && <Link href="/lancamentos" className="text-center text-sm text-gold underline">Ver todos os lançamentos</Link>}
        </section>
      </div>
    </div>
  );
}
