import Link from "next/link";
import { ContaRow, type ContaView } from "@/components/conta-row";
import { Orbits } from "@/components/orbits";
import { monthLabel } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";

const pct = (parte: number, total: number) => (total > 0 ? Math.min(100, Math.round((parte / total) * 100)) : 0);

const ATALHOS = [
  { href: "/lancamentos/novo", tag: "Comece aqui", titulo: "Lançar", desc: "Valor, meio e pronto em segundos", cor: "bg-brand-deep text-white" },
  { href: "/contas", tag: "Vencimentos", titulo: "Contas do mês", desc: "O que pagar e o que receber", cor: "bg-gold text-canvas" },
  { href: "/painel", tag: "Visão geral", titulo: "Painel", desc: "Receita, despesa e resultado do mês", cor: "bg-surface text-white" },
  { href: "/fluxo", tag: "Projeção", titulo: "Fluxo de caixa", desc: "Os próximos 6 meses, dia a dia", cor: "bg-surface text-white" },
  { href: "/cartoes", tag: "Cartões", titulo: "Faturas", desc: "Parcelas e assinaturas por cartão", cor: "bg-surface text-white" },
  { href: "/dre", tag: "Resultado", titulo: "DRE", desc: "Quanto a Aventure realmente lucra", cor: "bg-surface text-white" },
  { href: "/configuracoes/recorrencias", tag: "Automático", titulo: "Recorrências", desc: "Assinaturas e contas fixas", cor: "bg-surface text-white" },
];

export type InicioData = {
  mes: string; aPagar: number; aReceber: number; pagoCents: number; recebidoCents: number;
  atrasadas: number; revisar: number; proximas: ContaView[];
};

export function InicioView({ mes, aPagar, aReceber, pagoCents, recebidoCents, atrasadas, revisar, proximas }: InicioData) {
  return (
    <div className="-mx-4 -my-6 md:-mx-11 md:-my-8">
      {/* topo */}
      <section className="relative overflow-hidden border-b border-line px-4 py-10 md:px-11 md:py-14">
        <Orbits className="top-0 right-0 hidden h-full w-3/4 md:block" />
        <div className="relative max-w-2xl">
          <span className="inline-block rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white">Aventure Comunicação · uso interno</span>
          <h1 className="mt-5 font-heading text-4xl leading-[1.05] font-bold md:text-6xl">Bem-vindo ao<br />Aventure Financeiro</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">Lance em segundos, acompanhe o mês e saiba quanto a empresa e cada pessoa realmente gastam.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/lancamentos/novo" className="rounded-full bg-gold px-6 py-3 font-semibold text-canvas hover:brightness-110">Novo lançamento</Link>
            <Link href="/contas" className="rounded-full border border-line-strong px-6 py-3 font-medium hover:bg-surface">Ver contas do mês</Link>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-10 px-4 py-8 md:px-11">
        {/* negócio no mês */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Seu caixa em {monthLabel(mes)}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-line bg-surface p-6">
              <div className="text-sm text-muted">A pagar este mês</div>
              <div className="mt-2 font-heading text-4xl font-bold">{centsToBRL(aPagar)}</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${pct(pagoCents, pagoCents + aPagar)}%` }} /></div>
              <div className="mt-3 text-sm text-muted">{atrasadas > 0 ? `${atrasadas} conta(s) vencida(s)` : "Nenhuma conta vencida"} · já pago {centsToBRL(pagoCents)}</div>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-6">
              <div className="text-sm text-muted">A receber este mês</div>
              <div className="mt-2 font-heading text-4xl font-bold text-emerald-300">{centsToBRL(aReceber)}</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-gold" style={{ width: `${pct(recebidoCents, recebidoCents + aReceber)}%` }} /></div>
              <div className="mt-3 text-sm text-muted">Já recebido {centsToBRL(recebidoCents)}</div>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-6">
              <div className="text-sm text-muted">Fila de revisão</div>
              <div className="mt-2 flex items-baseline gap-2"><span className="font-heading text-4xl font-bold">{revisar}</span><span className="text-muted">sem categoria</span></div>
              <div className="mt-4 text-sm text-muted">Lançamentos que a categoria ainda não foi escolhida.</div>
              <Link href="/lancamentos?revisao=1" className="mt-2 inline-block text-sm font-medium text-gold underline">Revisar agora</Link>
            </div>
          </div>
        </section>

        {/* próximos vencimentos */}
        {proximas.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Vence em até 7 dias</h2>
              <Link href="/contas" className="text-sm font-medium text-gold underline">Ver tudo</Link>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">{proximas.map((c) => <ContaRow key={c.id} c={c} mes={mes.slice(0, 7)} />)}</ul>
          </section>
        )}

        {/* atalhos */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Atalhos</h2>
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {ATALHOS.map((a) => (
              <Link key={a.href} href={a.href} className="group w-60 shrink-0">
                <div className={`relative flex h-44 flex-col justify-end overflow-hidden rounded-3xl border border-line p-5 ${a.cor}`}>
                  <Orbits className="right-0 bottom-0 h-full w-full opacity-70" />
                  <div className="relative text-[11px] font-semibold tracking-widest uppercase opacity-80">{a.tag}</div>
                  <div className="relative font-display text-3xl leading-none uppercase">{a.titulo}</div>
                </div>
                <p className="mt-2 text-sm text-muted">{a.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <p className="pt-4 text-center text-xs text-muted">Aventure Financeiro · um sistema Aventure Comunicação</p>
      </div>
    </div>
  );
}
