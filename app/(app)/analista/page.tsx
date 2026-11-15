import Link from "next/link";
import { AnalistaChat } from "@/components/analista-chat";
import { type Report } from "@/lib/analista/report";
import { monthLabel, monthStart, todayFortaleza } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";
import { generateReport } from "./actions";

export const maxDuration = 300; // o Opus leva alguns segundos para escrever o relatório

const reais = (v: number) => centsToBRL(Math.round(v * 100));

type Row = { period_month: string; content: { report: Report; model?: string; generated_at?: string } };

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await getCtx();
  const anterior = addInvoiceMonths(monthStart(todayFortaleza()), -1);
  const { data } = await supabase.from("ai_insights").select("period_month, content").eq("kind", "monthly_report").order("period_month", { ascending: false }).limit(12);
  const list = (data ?? []) as Row[];
  const escolhido = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : list[0]?.period_month ?? anterior;
  const atual = list.find((r) => r.period_month.slice(0, 7) === escolhido.slice(0, 7));
  const rep = atual?.content.report;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Analista financeiro</h1>
        <p className="text-sm text-muted">Todo dia 1, a IA analisa o mês anterior com os números agregados (nunca a lista de lançamentos) e aponta vazamentos, economia e alertas.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {list.map((r) => (
          <Link key={r.period_month} href={`/analista?mes=${r.period_month.slice(0, 7)}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${r.period_month.slice(0, 7) === escolhido.slice(0, 7) ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
            {monthLabel(r.period_month)}
          </Link>
        ))}
        <form action={generateReport} className="ml-auto">
          <input type="hidden" name="mes" value={escolhido.slice(0, 7)} />
          <button className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-canvas hover:brightness-110">
            {rep ? "Gerar de novo" : `Gerar relatório de ${monthLabel(escolhido)}`}
          </button>
        </form>
      </div>

      {!rep && <p className="rounded-xl bg-surface p-4 text-muted">Ainda não há relatório de {monthLabel(escolhido)}. Toque em “Gerar relatório” (leva alguns segundos).</p>}

      {rep && (
        <div className="flex flex-col gap-4">
          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="mb-2 font-semibold">Resumo de {monthLabel(escolhido)}</h2>
            <p className="text-[15px] leading-relaxed">{rep.resumo}</p>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="mb-3 font-semibold">Saúde da Aventure</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div><dt className="text-muted">Margem</dt><dd>{rep.saude_aventure.margem}</dd></div>
              <div><dt className="text-muted">Lucro</dt><dd>{rep.saude_aventure.lucro}</dd></div>
              <div><dt className="text-muted">Retiradas contra o lucro</dt><dd>{rep.saude_aventure.retiradas_vs_lucro}</dd></div>
            </dl>
          </section>

          {rep.alertas.length > 0 && (
            <section className="rounded-3xl border border-line bg-surface p-5">
              <h2 className="mb-3 font-semibold">Alertas</h2>
              <ul className="flex flex-col gap-2">{rep.alertas.map((a, i) => <li key={i} className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200"><strong className="uppercase">{a.tipo}</strong> · {a.mensagem}</li>)}</ul>
            </section>
          )}

          {rep.vazamentos.length > 0 && (
            <section className="rounded-3xl border border-line bg-surface p-5">
              <h2 className="mb-3 font-semibold">Vazamentos</h2>
              <ul className="divide-y divide-line">{rep.vazamentos.map((v, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm"><div><div className="font-medium">{v.item}</div><div className="text-muted">{v.motivo}</div></div><div className="shrink-0 font-semibold">{reais(v.valor_mensal)}/mês</div></li>
              ))}</ul>
            </section>
          )}

          {rep.economia.length > 0 && (
            <section className="rounded-3xl border border-line bg-surface p-5">
              <h2 className="mb-3 font-semibold">Como economizar</h2>
              <ul className="divide-y divide-line">{rep.economia.map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm"><div className="font-medium">{e.acao}</div><div className="shrink-0 text-right"><div className="font-semibold text-emerald-300">{reais(e.economia_mensal)}/mês</div><div className="text-xs text-muted">{reais(e.economia_3_meses)} em 3 meses</div></div></li>
              ))}</ul>
            </section>
          )}

          {rep.pergunta_para_voces && (
            <section className="rounded-3xl border border-brand/40 bg-brand/10 p-5">
              <h2 className="mb-1 font-semibold">Uma pergunta para vocês</h2>
              <p className="text-[15px]">{rep.pergunta_para_voces}</p>
            </section>
          )}
          <p className="text-xs text-muted">Gerado pela IA{atual?.content.model ? ` (${atual.content.model})` : ""}{atual?.content.generated_at ? ` em ${new Date(atual.content.generated_at).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}` : ""}. Análise automática, sem recomendação de investimento. Confira os números no DRE.</p>
        </div>
      )}

      <AnalistaChat />
    </div>
  );
}
