import Link from "next/link";
import { DreTable, pctTxt } from "@/components/dre-table";
import { monthLabel, monthStart, todayFortaleza } from "@/lib/dates";
import { loadDreInput } from "@/lib/dre-data";
import { dreTable } from "@/lib/dre";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(todayFortaleza());
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);

  const { supabase } = await getCtx();
  const input = await loadDreInput(supabase, addInvoiceMonths(mes, -3), mes);
  const { cur, prev, rows } = dreTable(input, mes);

  // lançamentos da Aventure sem categoria no mês não entram em nenhuma linha
  const { data: pj } = await supabase.from("entities").select("id").eq("kind", "pj");
  const pjIds = (pj ?? []).map((e) => e.id as string);
  const { count: semCategoria } = pjIds.length
    ? await supabase.from("transactions").select("id", { count: "exact", head: true })
        .in("entity_id", pjIds).is("category_id", null).in("type", ["income", "expense"])
        .gte("competence_date", mes).lt("competence_date", addInvoiceMonths(mes, 1))
    : { count: 0 };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DRE</h1>
          <p className="text-sm text-muted">Aventure · ME no Simples Nacional · por competência</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/dre?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Mês anterior">‹</Link>
          <span className="min-w-36 text-center font-medium capitalize">{monthLabel(mes)}</span>
          <Link href={`/dre?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próximo mês">›</Link>
        </div>
      </div>

      {input.rate == null && cur.dasKind === "sem_aliquota" && (
        <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
          A linha do Simples está zerada porque a alíquota efetiva não foi cadastrada.{" "}
          <Link href="/configuracoes/geral" className="font-medium underline">Cadastrar alíquota</Link>
        </p>
      )}
      {(semCategoria ?? 0) > 0 && (
        <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
          {semCategoria} lançamento(s) da Aventure neste mês estão sem categoria e não entram no DRE.{" "}
          <Link href="/revisao" className="font-medium underline">Revisar</Link>
        </p>
      )}

      <DreTable rows={rows} cur={cur} prev={prev} mes={mes.slice(0, 7)} />

      {cur.dasPrevisto != null && cur.dasPago > 0 && (
        <p className="rounded-xl bg-surface p-4 text-sm text-muted">
          <strong className="text-ink">Conferência do DAS:</strong> pago {centsToBRL(cur.dasPago)} · previsto pela alíquota efetiva ({pctTxt(Math.round((input.rate ?? 0) * 10000) / 100)} × receita) {centsToBRL(cur.dasPrevisto)} ·
          diferença {centsToBRL(cur.dasPago - cur.dasPrevisto)}.
        </p>
      )}
      <ul className="flex flex-col gap-1 text-xs text-muted">
        <li>Clique em uma linha para ver os lançamentos dela. A média considera os 3 meses anteriores ao escolhido.</li>
        <li>Gastos de pessoa física nunca entram no DRE: viram orçamento doméstico, ou retirada quando pagos pela empresa.</li>
        <li>O enquadramento no Anexo III ou V depende do CNPJ e do Fator R: confirme a alíquota efetiva com a contadora.</li>
      </ul>
      <Link href="/dre/fora-do-pj" className="w-fit rounded-xl border border-line-strong px-4 py-3 text-sm hover:bg-surface">
        Gastos da Aventure fora do PJ →
      </Link>
    </div>
  );
}
