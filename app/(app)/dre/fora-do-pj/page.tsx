import Link from "next/link";
import { monthTitle, monthStart, todayFortaleza } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths } from "@/lib/invoice";
import { groupOff, monthTotal, ruleFor, series, type OffTx } from "@/lib/fora-pj";
import { getCtx } from "@/lib/org";
import { migrateRule } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(todayFortaleza());
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);

  const { supabase } = await getCtx();
  const [ents, pms] = await Promise.all([
    supabase.from("entities").select("id, kind"),
    supabase.from("payment_methods").select("id, name, kind, owner_entity_id, active"),
  ]);
  const kind = new Map((ents.data ?? []).map((e) => [e.id as string, e.kind as string]));
  const pjIds = (ents.data ?? []).filter((e) => e.kind === "pj").map((e) => e.id as string);
  const methods = (pms.data ?? []) as { id: string; name: string; kind: string; owner_entity_id: string; active: boolean }[];
  const offIds = methods.filter((m) => kind.get(m.owner_entity_id) !== "pj").map((m) => m.id);
  const pjCards = methods.filter((m) => m.active && kind.get(m.owner_entity_id) === "pj" && m.kind === "credit_card");
  const nome = new Map(methods.map((m) => [m.id, m.name]));

  const from = addInvoiceMonths(mes, -5);
  const [txs, rules] = await Promise.all([
    pjIds.length && offIds.length
      ? supabase.from("transactions").select("id, description, amount_cents, paid_amount_cents, status, competence_date, payment_method_id")
          .eq("type", "expense").in("entity_id", pjIds).in("payment_method_id", offIds)
          .gte("competence_date", from).lt("competence_date", addInvoiceMonths(mes, 1)).limit(3000)
      : Promise.resolve({ data: [] as OffTx[] }),
    pjIds.length && offIds.length
      ? supabase.from("recurring_rules").select("id, description, payment_method_id").eq("active", true).eq("direction", "out").in("entity_id", pjIds).in("payment_method_id", offIds)
      : Promise.resolve({ data: [] as { id: string; description: string; payment_method_id: string | null }[] }),
  ]);
  const list = (txs.data ?? []) as OffTx[];
  const ruleList = (rules.data ?? []) as { id: string; description: string; payment_method_id: string | null }[];

  const s = series(list, mes);
  const max = Math.max(1, ...s.map((x) => x.cents));
  const total = monthTotal(list, mes);
  const diff = total - monthTotal(list, addInvoiceMonths(mes, -1));
  const groups = groupOff(list, mes);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/dre" className="text-sm text-muted">← DRE</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gastos da Aventure fora do PJ</h1>
          <p className="text-sm text-muted">O que é da empresa, mas caiu em cartão ou conta pessoal. A meta é este número cair mês a mês.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/dre/fora-do-pj?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Mês anterior">‹</Link>
          <span className="min-w-32 text-center font-medium">{monthTitle(mes)}</span>
          <Link href={`/dre/fora-do-pj?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próximo mês">›</Link>
        </div>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Recorrência migrada. Vale a partir da próxima geração de contas.</p>}

      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <div className="font-heading text-3xl font-bold">{centsToBRL(total)}</div>
          <div className={`text-sm ${diff > 0 ? "text-red-300" : "text-emerald-300"}`}>{diff === 0 ? "igual ao mês anterior" : `${diff > 0 ? "+" : "−"}${centsToBRL(Math.abs(diff))} vs. mês anterior`}</div>
        </div>
        <div className="mt-4 flex h-24 items-end gap-2" role="img" aria-label="Total por mês nos últimos 6 meses">
          {s.map((x) => (
            <div key={x.month} className="flex flex-1 flex-col items-center gap-1">
              <div className={`w-full max-w-6 rounded-t-md ${x.month === mes ? "bg-brand" : "bg-line-strong"}`} style={{ height: `${Math.max(3, (x.cents / max) * 80)}px` }} title={centsToBRL(x.cents)} />
              <span className="text-[10px] text-muted">{x.month.slice(5, 7)}/{x.month.slice(2, 4)}</span>
            </div>
          ))}
        </div>
      </div>

      {pjCards.length === 0 && (
        <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
          Não há cartão da empresa cadastrado para receber as assinaturas. Cadastre o cartão Asaas PJ em{" "}
          <Link href="/configuracoes/meios" className="font-medium underline">Meios de pagamento</Link>.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Lista de trabalho</h2>
        {groups.length === 0 && <p className="text-muted">Nada da Aventure fora do PJ neste mês. 🎉</p>}
        {groups.map((g) => {
          const rule = ruleFor(ruleList, g);
          return (
            <div key={g.key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.description}</div>
                  <div className="text-sm text-muted">{nome.get(g.methodId) ?? "—"}{g.count > 1 ? ` · ${g.count} lançamentos` : ""}{rule ? " · assinatura/recorrência" : ""}</div>
                </div>
                <div className="shrink-0 font-semibold">{centsToBRL(g.totalCents)}</div>
              </div>
              {rule && pjCards.length > 0 && (
                <form action={migrateRule} className="mt-3 flex gap-2">
                  <input type="hidden" name="rule" value={rule.id} />
                  <input type="hidden" name="mes" value={mes.slice(0, 7)} />
                  <select name="card" required defaultValue={pjCards[0].id} className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2 py-2 text-sm text-ink">
                    {pjCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-canvas">Migrar</button>
                </form>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
