import { CommitmentsChart } from "@/components/charts";
import { ConfirmButton } from "@/components/config/confirm-button";
import { RecordForm, type Field } from "@/components/config/crud";
import { MESES_CURTOS } from "@/lib/cashflow";
import { KINDS, monthlyLoad, nFromExternal, summarize, type Commitment, type InstTx } from "@/lib/compromissos";
import { monthStart, todayFortaleza } from "@/lib/dates";
import { centsToBRL, centsToInput } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { createCommitment, deleteCommitment, endCommitment, updateCommitment } from "./actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const mesAno = (iso: string) => `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

const STATE = {
  em_dia: { label: "Em dia", cls: "bg-emerald-500/10 text-emerald-300" },
  atrasado: { label: "Parcela atrasada", cls: "bg-red-500/10 text-red-300" },
  quitado: { label: "Quitado", cls: "bg-surface-2 text-muted" },
  encerrado: { label: "Encerrado", cls: "bg-surface-2 text-muted" },
} as const;

type Tx = { commitment_id: string; external_id: string | null; status: string; amount_cents: number; paid_amount_cents: number | null; cash_date: string };

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const { supabase } = await getCtx();
  const [cms, txs, ents, pms, cats] = await Promise.all([
    supabase.from("commitments").select("*").order("active", { ascending: false }).order("name"),
    supabase.from("transactions").select("commitment_id, external_id, status, amount_cents, paid_amount_cents, cash_date").not("commitment_id", "is", null).limit(5000),
    supabase.from("entities").select("id, name").order("name"),
    supabase.from("payment_methods").select("id, name, kind").eq("active", true).neq("kind", "credit_card").order("name"),
    supabase.from("categories").select("id, name").eq("direction", "out").order("name"),
  ]);
  const list = (cms.data ?? []) as Commitment[];
  const all = (txs.data ?? []) as Tx[];
  const opts = (l: { data: { id: string; name: string }[] | null }) => (l.data ?? []).map((x) => ({ value: x.id, label: x.name }));
  const entName = new Map((ents.data ?? []).map((e) => [e.id as string, e.name as string]));

  const rows = list.map((c) => {
    const mine: InstTx[] = all.filter((t) => t.commitment_id === c.id).flatMap((t) => {
      const n = nFromExternal(t.external_id, c.id);
      return n == null ? [] : [{ n, status: t.status, amount_cents: t.amount_cents, paid_amount_cents: t.paid_amount_cents, cash_date: t.cash_date }];
    });
    return { c, s: summarize(c, mine, hoje) };
  });
  const ativos = rows.filter((r) => r.c.active && r.s.remaining > 0);
  const porMes = ativos.reduce((sum, r) => sum + r.c.installment_cents, 0);
  const saldo = ativos.reduce((sum, r) => sum + r.s.remainingCents, 0);
  const proximo = ativos.filter((r) => r.s.nextDue).sort((a, b) => (a.s.nextDue! < b.s.nextDue! ? -1 : 1))[0];
  const carga = monthlyLoad(all.filter((t) => ativos.some((r) => r.c.id === t.commitment_id)), monthStart(hoje), 12)
    .map((m) => ({ label: `${MESES_CURTOS[Number(m.month.slice(5, 7)) - 1]}`, cents: m.cents }));

  const baseFields: Field[] = [
    { name: "name", label: "Nome", type: "text", required: true },
    { name: "entity_id", label: "De quem é", type: "select", required: true, options: opts(ents) },
    { name: "installment", label: "Valor da parcela (R$)", type: "money", required: true },
    { name: "installments", label: "Total de parcelas", type: "number", required: true },
  ];
  const optional: Field[] = [
    { name: "institution", label: "Banco ou administradora (opcional)", type: "text" },
    { name: "contracted", label: "Valor contratado ou carta de crédito (R$, opcional)", type: "money" },
    { name: "payment_method_id", label: "Sai de qual conta (opcional)", type: "select", options: opts(pms), hint: "Cartão de crédito não: a parcela sai da conta no vencimento." },
    { name: "category_id", label: "Categoria (opcional)", type: "select", options: opts(cats), hint: "Sem escolher, usa “Empréstimos e financiamentos”, se existir." },
    { name: "contemplated_on", label: "Contemplado em (consórcio, opcional)", type: "date" },
    { name: "notes", label: "Observações (opcional)", type: "text" },
  ];
  const createFields: Field[] = [
    { name: "kind", label: "Tipo", type: "select", required: true, options: Object.entries(KINDS).map(([value, label]) => ({ value, label })) },
    ...baseFields,
    { name: "paid_before", label: "Quantas parcelas já foram pagas", type: "number", required: true, hint: "Use 0 se está começando agora." },
    { name: "next_due", label: "Vencimento da próxima parcela", type: "date", required: true },
    ...optional,
  ];
  const editFields: Field[] = [...baseFields, ...optional];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Empréstimos e consórcios</h1>
        <p className="text-sm text-muted">Cadastre uma vez. As parcelas que faltam entram sozinhas no fluxo de caixa e em Contas do mês, onde você marca como paga.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Salvo.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { n: "Parcelas por mês", v: centsToBRL(porMes) },
          { n: "Saldo restante", v: centsToBRL(saldo) },
          { n: "Próxima parcela", v: proximo ? dataBR(proximo.s.nextDue!).slice(0, 5) : "—", sub: proximo?.c.name },
          { n: "Compromissos ativos", v: String(ativos.length) },
        ].map((c) => (
          <div key={c.n} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm text-muted">{c.n}</div>
            <div className="mt-1 font-heading text-xl font-bold whitespace-nowrap">{c.v}</div>
            {c.sub && <div className="truncate text-xs text-muted">{c.sub}</div>}
          </div>
        ))}
      </div>

      {ativos.length > 0 && (
        <section className="rounded-3xl border border-line bg-surface p-4">
          <h2 className="mb-1 font-semibold">Quanto pesa por mês</h2>
          <p className="mb-2 text-xs text-muted">Parcelas ainda não pagas nos próximos 12 meses.</p>
          <CommitmentsChart data={carga} />
        </section>
      )}

      <details className="rounded-3xl border border-dashed border-line-strong" open={list.length === 0}>
        <summary className="cursor-pointer p-4 font-medium">+ Novo empréstimo, financiamento ou consórcio</summary>
        <div className="border-t border-line p-4">
          <RecordForm action={createCommitment} fields={createFields} values={{ paid_before: "0" }} submitLabel="Cadastrar e gerar parcelas" />
        </div>
      </details>

      {list.length === 0 && <p className="text-muted">Nada cadastrado ainda.</p>}
      <div className="flex flex-col gap-3">
        {rows.map(({ c, s }) => {
          const st = STATE[s.state];
          return (
            <section key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{KINDS[c.kind]}</span>
                    {c.kind === "consortium" && c.contemplated_on && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold">Contemplado</span>}
                  </div>
                  <div className="mt-1 truncate font-semibold">{c.name}</div>
                  <div className="text-sm text-muted">{entName.get(c.entity_id) ?? "—"}{c.institution ? ` · ${c.institution}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{centsToBRL(c.installment_cents)}<span className="text-xs font-normal text-muted">/mês</span></div>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={s.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Parcelas pagas">
                <div className="h-full rounded-full bg-brand" style={{ width: `${s.progress}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted">
                <span>{s.paidCount} de {c.installments} pagas{s.remaining > 0 ? ` · faltam ${s.remaining}` : ""}</span>
                <span>{s.remaining > 0 ? `termina em ${mesAno(s.endDate)}` : "sem parcelas pendentes"}</span>
              </div>
              {s.remaining > 0 && (
                <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-sm">
                  <span>{s.nextDue ? `Próxima: ${dataBR(s.nextDue)} · ${centsToBRL(s.nextCents)}` : ""}</span>
                  <span className="text-muted">Restante {centsToBRL(s.remainingCents)}{c.contracted_cents ? ` · contratado ${centsToBRL(c.contracted_cents)}` : ""}</span>
                </div>
              )}

              <details className="mt-3 rounded-xl border border-line">
                <summary className="cursor-pointer p-3 text-sm">Editar</summary>
                <div className="flex flex-col gap-4 border-t border-line p-3">
                  <RecordForm action={updateCommitment} id={c.id} fields={editFields} submitLabel="Salvar"
                    values={{
                      name: c.name, entity_id: c.entity_id, installment: centsToInput(c.installment_cents), installments: String(c.installments),
                      institution: c.institution ?? "", contracted: centsToInput(c.contracted_cents), payment_method_id: c.payment_method_id ?? "",
                      category_id: c.category_id ?? "", contemplated_on: c.contemplated_on ?? "", notes: c.notes ?? "",
                    }} />
                  <p className="text-xs text-muted">Mudar o valor ou o total atualiza só as parcelas ainda não pagas. As pagas ficam como estão.</p>
                  <div className="flex flex-wrap gap-4 border-t border-line pt-3">
                    {c.active && s.remaining > 0 && (
                      <form action={endCommitment}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmButton message={`Encerrar "${c.name}"? As parcelas futuras saem do caixa; as já pagas ficam no histórico.`} className="text-sm text-amber-300 underline">Encerrar (quitei ou cancelei)</ConfirmButton>
                      </form>
                    )}
                    <form action={deleteCommitment}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message={`Apagar "${c.name}"? As parcelas não pagas são removidas; as pagas ficam no histórico.`} className="text-sm text-red-400 underline">Apagar</ConfirmButton>
                    </form>
                  </div>
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
