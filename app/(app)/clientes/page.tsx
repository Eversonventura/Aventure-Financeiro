import Link from "next/link";
import { ContaRow, type ContaView } from "@/components/conta-row";
import { RecordForm, type Field } from "@/components/config/crud";
import { summarizeClients, type CRule, type CTx } from "@/lib/clientes";
import { diffDays, monthEnd, monthLabel, monthStart, todayFortaleza } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { getCtx } from "@/lib/org";
import { generateNow } from "../contas/actions";
import { createMonthlyClient } from "./actions";

const STATUS = {
  recebido: { label: "Recebido", cls: "bg-emerald-500/10 text-emerald-300" },
  a_receber: { label: "A receber", cls: "bg-surface-2 text-muted" },
  atrasado: { label: "Atrasado", cls: "bg-red-500/10 text-red-300" },
  nao_gerado: { label: "Previsto", cls: "bg-amber-400/10 text-amber-300" },
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(hoje);
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);

  const { supabase } = await getCtx();
  const { data: pj } = await supabase.from("entities").select("id").eq("kind", "pj");
  const pjIds = (pj ?? []).map((e) => e.id as string);
  const [cls, txs, rules] = await Promise.all([
    supabase.from("clients").select("id, name").eq("active", true).order("name"),
    pjIds.length
      ? supabase.from("transactions").select("id, client_id, description, amount_cents, paid_amount_cents, status, cash_date")
          .eq("type", "income").in("entity_id", pjIds).gte("cash_date", mes).lte("cash_date", monthEnd(mes)).order("cash_date")
      : Promise.resolve({ data: [] as CTx[] }),
    supabase.from("recurring_rules").select("id, client_id, amount_cents, day_of_month, start_month, end_month").eq("active", true).eq("direction", "in").not("client_id", "is", null),
  ]);
  const s = summarizeClients({ clients: (cls.data ?? []) as { id: string; name: string }[], txs: (txs.data ?? []) as CTx[], rules: (rules.data ?? []) as CRule[], month: mes, today: hoje });

  const view = (name: string, t: CTx): ContaView => {
    const paid = t.status === "paid";
    const dias = diffDays(hoje, t.cash_date);
    const [label, tone] = paid ? ["Recebido", "ok" as const] : dias < 0 ? ["Atrasado", "late" as const] : dias <= 7 ? ["Recebe em breve", "warn" as const] : ["A receber", "plain" as const];
    return { id: t.id, description: t.description === name ? name : `${name} · ${t.description}`, amount_cents: t.amount_cents, paid_amount_cents: t.paid_amount_cents, due: t.cash_date, kind: "receber", paid, label, tone, sub: "" };
  };

  const fields: Field[] = [
    { name: "name", label: "Nome do cliente", type: "text", required: true },
    { name: "amount", label: "Valor mensal (R$)", type: "money", required: true },
    { name: "day", label: "Dia do pagamento", type: "number", required: true, hint: "Dia 31 vale o último dia dos meses mais curtos." },
    { name: "start", label: "Começa em", type: "month", required: true },
    { name: "end", label: "Termina em (opcional)", type: "month" },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <div className="flex items-center gap-3">
          <Link href={`/clientes?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Mês anterior">‹</Link>
          <span className="min-w-32 text-center font-medium capitalize">{monthLabel(mes)}</span>
          <Link href={`/clientes?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próximo mês">›</Link>
        </div>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Cliente cadastrado com cobrança mensal.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { n: "Esperado", v: centsToBRL(s.expected), c: "" },
          { n: "Recebido", v: centsToBRL(s.received), c: "text-emerald-300" },
          { n: "Em aberto", v: centsToBRL(s.open), c: s.late > 0 ? "text-red-300" : "" },
          { n: "Maior cliente", v: s.top ? `${s.top.pct}%` : "—", c: "", sub: s.top?.name },
        ].map((c) => (
          <div key={c.n} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm text-muted">{c.n}</div>
            <div className={`mt-1 font-heading text-2xl font-bold ${c.c}`}>{c.v}</div>
            {c.sub && <div className="truncate text-xs text-muted">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/lancamentos/novo?tipo=entrada" className="rounded-xl bg-gold px-4 py-3 font-semibold text-canvas">Registrar recebimento</Link>
        <form action={generateNow}>
          <input type="hidden" name="mes" value={mes.slice(0, 7)} />
          <input type="hidden" name="to" value="clientes" />
          <button className="rounded-xl border border-line-strong px-4 py-3 text-sm hover:bg-surface">Gerar cobranças do mês</button>
        </form>
      </div>

      <details className="rounded-3xl border border-dashed border-line-strong" open={s.rows.length === 0}>
        <summary className="cursor-pointer p-4 font-medium">+ Novo cliente mensal</summary>
        <div className="border-t border-line p-4">
          <p className="mb-3 text-sm text-muted">Só o básico: nome, valor e dia do pagamento. A cobrança aparece todo mês e você marca como recebida quando o cliente depositar.</p>
          <RecordForm action={createMonthlyClient} fields={fields} values={{ start: mes.slice(0, 7) }} submitLabel="Cadastrar" />
        </div>
      </details>

      {s.rows.length === 0 && <p className="text-muted">Nenhuma cobrança de cliente neste mês.</p>}
      <div className="flex flex-col gap-3">
        {s.rows.map((r) => {
          const st = STATUS[r.status];
          return (
            <section key={r.id ?? "avulso"} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.name}</div>
                  <div className="text-sm text-muted">
                    {r.rule ? `mensal · dia ${r.rule.day_of_month} · ${centsToBRL(r.rule.amount_cents)}` : "recebimento avulso"}
                    {r.status === "atrasado" ? ` · ${r.lateDays} dia(s) de atraso` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{centsToBRL(r.expected)}</div>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                </div>
              </div>
              {r.status === "nao_gerado" && <p className="mt-2 text-sm text-amber-300">Ainda não gerada neste mês. Toque em “Gerar cobranças do mês”.</p>}
              {r.txs.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">{r.txs.map((t) => <ContaRow key={t.id} c={view(r.name, t)} mes={mes.slice(0, 7)} to="clientes" />)}</ul>
              )}
            </section>
          );
        })}
      </div>

      {s.ending.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">Contratos que terminam em breve</h2>
          <ul className="text-sm text-muted">{s.ending.map((e) => <li key={e.name + e.end_month}>{e.name} · até {e.end_month.slice(5, 7)}/{e.end_month.slice(0, 4)}</li>)}</ul>
        </section>
      )}
      <Link href="/configuracoes/clientes" className="text-sm text-muted underline">Editar cadastro de clientes</Link>
    </div>
  );
}
