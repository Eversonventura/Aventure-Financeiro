import Link from "next/link";
import { monthLabel, monthStart, todayFortaleza } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths, cashDateFor } from "@/lib/invoice";
import { getCtx } from "@/lib/org";

type Card = { id: string; name: string; closing_day: number | null; due_day: number | null; credit_limit_cents: number | null };
type Item = {
  id: string; description: string; amount_cents: number; paid_amount_cents: number | null; status: string; type: "expense" | "income";
  payment_method_id: string; entity_id: string; installment_group_id: string | null; installment_number: number | null; competence_date: string;
};

const eff = (t: Pick<Item, "amount_cents" | "paid_amount_cents" | "status" | "type">) =>
  (t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : t.amount_cents) * (t.type === "income" ? -1 : 1);

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(hoje);
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);

  const { supabase } = await getCtx();
  const [cardsRes, itemsRes, entsRes, futureRes, rulesRes] = await Promise.all([
    supabase.from("payment_methods").select("id, name, closing_day, due_day, credit_limit_cents").eq("kind", "credit_card").eq("active", true).order("name"),
    supabase.from("transactions").select("id, description, amount_cents, paid_amount_cents, status, type, payment_method_id, entity_id, installment_group_id, installment_number, competence_date")
      .eq("invoice_month", mes).in("type", ["expense", "income"]).order("competence_date", { ascending: false }),
    supabase.from("entities").select("id, name, kind"),
    supabase.from("transactions").select("installment_group_id, installment_number, amount_cents, description, payment_method_id, invoice_month")
      .not("installment_group_id", "is", null).gte("invoice_month", mes).order("invoice_month").limit(1000),
    supabase.from("recurring_rules").select("id, description, amount_cents, payment_method_id, entity_id").eq("active", true).eq("direction", "out").not("payment_method_id", "is", null),
  ]);

  const cards = (cardsRes.data ?? []) as Card[];
  const cardIds = new Set(cards.map((c) => c.id));
  const nomeCartao = new Map(cards.map((c) => [c.id, c.name]));
  const ents = new Map((entsRes.data ?? []).map((e) => [e.id as string, e as { id: string; name: string; kind: "pj" | "pf" | "shared" }]));
  const items = ((itemsRes.data ?? []) as Item[]).filter((i) => cardIds.has(i.payment_method_id));

  const groupIds = [...new Set(items.map((i) => i.installment_group_id).filter((x): x is string => !!x))];
  const { data: groups } = groupIds.length ? await supabase.from("installment_groups").select("id, installments").in("id", groupIds) : { data: [] };
  const totalParcelas = new Map((groups ?? []).map((g) => [g.id as string, g.installments as number]));

  const faturas = cards.map((c) => {
    const its = items.filter((i) => i.payment_method_id === c.id);
    const total = its.reduce((s, i) => s + eff(i), 0);
    const pj = its.filter((i) => ents.get(i.entity_id)?.kind === "pj").reduce((s, i) => s + eff(i), 0);
    return { card: c, its, total, pj, pf: total - pj, due: c.due_day ? cashDateFor(mes, c.due_day) : null };
  });
  const totalGeral = faturas.reduce((s, f) => s + f.total, 0);
  const totalPj = faturas.reduce((s, f) => s + f.pj, 0);

  // parcelamentos em andamento: agrupa as parcelas que ainda vão cair (a partir da fatura escolhida)
  const andamento = new Map<string, { descricao: string; cartao: string; restantes: number; valor: number; total: number; ultima: string; proxima: number | null }>();
  for (const t of (futureRes.data ?? []) as { installment_group_id: string; installment_number: number; amount_cents: number; description: string; payment_method_id: string; invoice_month: string }[]) {
    if (!cardIds.has(t.payment_method_id)) continue;
    const g = andamento.get(t.installment_group_id) ?? { descricao: t.description, cartao: nomeCartao.get(t.payment_method_id) ?? "", restantes: 0, valor: t.amount_cents, total: 0, ultima: t.invoice_month, proxima: null };
    g.restantes += 1;
    g.total += t.amount_cents;
    g.ultima = t.invoice_month > g.ultima ? t.invoice_month : g.ultima;
    g.proxima = g.proxima ?? t.installment_number;
    andamento.set(t.installment_group_id, g);
  }
  const parcelamentos = [...andamento.values()].sort((a, b) => b.total - a.total);
  const totalRestante = parcelamentos.reduce((s, p) => s + p.total, 0);

  const assinaturas = (rulesRes.data ?? []).filter((r) => cardIds.has(r.payment_method_id as string)) as { id: string; description: string; amount_cents: number; payment_method_id: string; entity_id: string }[];
  const totalAssinaturas = assinaturas.reduce((s, r) => s + r.amount_cents, 0);
  const assinaturasPj = assinaturas.filter((r) => ents.get(r.entity_id)?.kind === "pj").reduce((s, r) => s + r.amount_cents, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Cartões</h1>
        <div className="flex items-center gap-3">
          <Link href={`/cartoes?mes=${ant}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Fatura anterior">‹</Link>
          <span className="min-w-36 text-center font-medium capitalize">Faturas de {monthLabel(mes)}</span>
          <Link href={`/cartoes?mes=${prox}`} className="rounded-lg border border-line-strong px-3 py-1.5" aria-label="Próxima fatura">›</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-sm text-muted">Total das faturas</div><div className="mt-1 font-heading text-2xl font-bold">{centsToBRL(totalGeral)}</div></div>
        <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-sm text-muted">Da Aventure (PJ)</div><div className="mt-1 font-heading text-2xl font-bold">{centsToBRL(totalPj)}</div><div className="text-xs text-muted">o resto é pessoal ou da casa: {centsToBRL(totalGeral - totalPj)}</div></div>
        <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-sm text-muted">Parcelas a vencer</div><div className="mt-1 font-heading text-2xl font-bold">{centsToBRL(totalRestante)}</div><div className="text-xs text-muted">{parcelamentos.length} compra(s) parcelada(s)</div></div>
      </div>

      {cards.length === 0 && <p className="text-muted">Nenhum cartão cadastrado. Cadastre em Configurações → Meios de pagamento.</p>}

      <div className="flex flex-col gap-4">
        {faturas.map(({ card, its, total, pj, pf, due }) => (
          <section key={card.id} className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{card.name}</h2>
                <p className="text-sm text-muted">
                  {due ? `vence ${due.slice(8, 10)}/${due.slice(5, 7)}` : "vencimento a confirmar"}
                  {card.closing_day ? ` · fecha dia ${card.closing_day}` : ""}
                  {card.credit_limit_cents ? ` · limite ${centsToBRL(card.credit_limit_cents)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <div className="font-heading text-2xl font-bold">{centsToBRL(total)}</div>
                <div className="text-xs text-muted">PJ {centsToBRL(pj)} · PF/casa {centsToBRL(pf)}</div>
              </div>
            </div>
            {total > 0 && (
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-label="Divisão PJ e PF da fatura">
                <div className="bg-brand" style={{ width: `${Math.max(0, Math.round((pj / total) * 100))}%` }} />
              </div>
            )}
            {its.length === 0 ? <p className="mt-3 text-sm text-muted">Nenhuma compra nesta fatura.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {its.map((i) => {
                  const n = i.installment_number;
                  const N = i.installment_group_id ? totalParcelas.get(i.installment_group_id) : null;
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{i.description}{n && N ? <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{n}/{N}{N - n > 0 ? `, faltam ${N - n}` : ", última"}</span> : null}</div>
                        <div className="text-xs text-muted">{i.competence_date.slice(8, 10)}/{i.competence_date.slice(5, 7)} · {ents.get(i.entity_id)?.name ?? "—"}</div>
                      </div>
                      <div className="shrink-0 font-medium">{centsToBRL(eff(i))}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">Parcelamentos em andamento</h2>
        {parcelamentos.length === 0 ? <p className="text-sm text-muted">Nenhuma compra parcelada a vencer.</p> : (
          <ul className="divide-y divide-line">
            {parcelamentos.map((p, idx) => (
              <li key={idx} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{p.descricao}</div>
                  <div className="text-xs text-muted">{p.cartao} · restam {p.restantes} parcela(s) de {centsToBRL(p.valor)} · termina em {p.ultima.slice(5, 7)}/{p.ultima.slice(0, 4)}</div>
                </div>
                <div className="shrink-0 font-medium">{centsToBRL(p.total)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Assinaturas ativas nos cartões</h2>
          <span className="text-sm text-muted">{centsToBRL(totalAssinaturas)}/mês · Aventure {centsToBRL(assinaturasPj)}</span>
        </div>
        {assinaturas.length === 0 ? <p className="text-sm text-muted">Nenhuma recorrência no cartão. Cadastre em Configurações → Recorrências.</p> : (
          <ul className="divide-y divide-line">
            {assinaturas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0"><div className="truncate">{a.description}</div><div className="text-xs text-muted">{nomeCartao.get(a.payment_method_id)} · {ents.get(a.entity_id)?.name ?? "—"}</div></div>
                <div className="shrink-0 font-medium">{centsToBRL(a.amount_cents)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
