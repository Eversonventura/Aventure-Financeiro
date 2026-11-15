import Link from "next/link";
import { ContaRow } from "@/components/conta-row";
import { monthLabel, monthTitle, monthStart, todayFortaleza } from "@/lib/dates";
import { loadContasDoMes } from "@/lib/contas";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";
import { generateNow } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(hoje);
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);

  const { supabase } = await getCtx();
  const { contas, faturas, aPagar, aReceber } = await loadContasDoMes(supabase, mes, hoje);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href={`/contas?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Mês anterior">‹</Link>
        <h1 className="text-xl font-semibold">{monthTitle(mes)}</h1>
        <Link href={`/contas?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próximo mês">›</Link>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-muted">A pagar</div><div className="font-semibold">{centsToBRL(aPagar)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-muted">A receber</div><div className="font-semibold text-emerald-300">{centsToBRL(aReceber)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-3"><div className="text-muted">Saldo</div><div className="font-semibold">{centsToBRL(aReceber - aPagar)}</div></div>
      </div>

      {contas.length === 0 && (
        <p className="text-muted">Nenhuma conta neste mês. Cadastre as contas fixas em Configurações → Recorrências e gere o mês.</p>
      )}
      <ul className="flex flex-col gap-2">
        {contas.map((c) => <ContaRow key={c.id} c={c} mes={mes.slice(0, 7)} />)}
      </ul>

      {faturas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Faturas dos cartões</h2>
          {faturas.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
              <div><div className="font-medium">{f.nome}</div><div className="text-sm text-muted">{f.due ? `vence ${f.due.slice(8, 10)}/${f.due.slice(5, 7)}` : "vencimento a confirmar"}</div></div>
              <div className="font-semibold">{centsToBRL(f.total)}</div>
            </div>
          ))}
        </section>
      )}

      <form action={generateNow} className="pt-2">
        <input type="hidden" name="mes" value={mes.slice(0, 7)} />
        <button className="text-sm underline">Gerar as contas previstas de {monthLabel(mes)}</button>
      </form>
    </div>
  );
}
