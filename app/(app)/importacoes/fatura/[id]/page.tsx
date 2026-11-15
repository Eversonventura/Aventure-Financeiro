import Link from "next/link";
import { notFound } from "next/navigation";
import { centsToBRL } from "@/lib/format";
import { matchInvoice, type SysTx } from "@/lib/fatura/match";
import { getCtx } from "@/lib/org";
import { addMissing, fixAmount, ignoreItem, saveInvoiceSettings, type InvoiceLayout } from "../actions";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const sel = "rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 text-sm text-ink";

type Tx = { id: string; type: "expense" | "income"; description: string; amount_cents: number; paid_amount_cents: number | null; status: string; competence_date: string; installment_number: number | null };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await getCtx();
  const { data } = await supabase.from("imports").select("id, kind, status, original_name, layout, stats").eq("id", id).maybeSingle();
  if (!data || data.kind === "sheet") notFound();
  const stats = (data.stats ?? {}) as { error?: string; warnings?: string[] };

  const head = (
    <>
      <Link href="/importacoes" className="text-sm text-muted">← Importações</Link>
      <h1 className="text-2xl font-semibold">Conferência da fatura</h1>
      <p className="truncate text-sm text-muted">{data.original_name}</p>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-red-300">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-emerald-300">Pronto: {Number(sp.ok) > 1 ? `${sp.ok} lançamentos` : "atualizado"}.</p>}
    </>
  );

  const layout = data.layout as InvoiceLayout | null;
  if (data.status === "failed" || !layout) {
    return <div className="mx-auto flex max-w-3xl flex-col gap-4">{head}<p className="rounded-xl bg-red-500/10 p-4 text-red-300">{stats.error ?? "Não consegui ler a fatura."}</p></div>;
  }

  const [cardsRes, txRes] = await Promise.all([
    supabase.from("payment_methods").select("id, name").eq("kind", "credit_card").eq("active", true).order("name"),
    supabase.from("transactions").select("id, type, description, amount_cents, paid_amount_cents, status, competence_date, installment_number")
      .eq("payment_method_id", layout.card_id).eq("invoice_month", `${layout.month}-01`).in("type", ["expense", "income"]).order("competence_date").limit(2000),
  ]);
  const cards = (cardsRes.data ?? []) as { id: string; name: string }[];
  const sys: SysTx[] = ((txRes.data ?? []) as Tx[]).map((t) => ({
    id: t.id, description: t.description, date: t.competence_date, installment_number: t.installment_number,
    amount_cents: (t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : t.amount_cents) * (t.type === "income" ? -1 : 1),
  }));

  const r = matchInvoice(layout.lines, sys);
  const ign = new Set(layout.ignored);
  const idx = (l: (typeof layout.lines)[number]) => layout.lines.indexOf(l);
  const missing = r.missing.filter((l) => !ign.has(`L:${idx(l)}`));
  const diff = r.amountDiff.filter((p) => !ign.has(`T:${p.tx.id}`));
  const extra = r.extra.filter((t) => !ign.has(`T:${t.id}`));
  const totalFatura = layout.lines.reduce((s, l) => s + l.amount_cents, 0);
  const totalSistema = sys.reduce((s, t) => s + t.amount_cents, 0);
  const limpo = missing.length === 0 && diff.length === 0 && extra.length === 0;
  const cardName = cards.find((c) => c.id === layout.card_id)?.name ?? "cartão";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {head}
      {(stats.warnings ?? []).map((w) => <p key={w} className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300">{w}</p>)}

      <form action={saveInvoiceSettings} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
        <input type="hidden" name="id" value={id} />
        <label className="flex flex-col gap-1 text-sm"><span className="text-muted">Cartão</span>
          <select name="card" defaultValue={layout.card_id} className={sel}>{cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="text-muted">Fatura que vence em</span>
          <input type="month" name="month" defaultValue={layout.month} className={sel} /></label>
        <button className="rounded-lg border border-line-strong px-4 py-2.5 text-sm hover:bg-surface-2">Comparar de novo</button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { n: "Linhas na fatura", v: String(layout.lines.length), sub: centsToBRL(totalFatura) },
          { n: "Conferidas", v: String(r.matched.length), sub: "lançadas certinho" },
          { n: "Faltam lançar", v: String(missing.length), sub: centsToBRL(missing.reduce((s, l) => s + l.amount_cents, 0)), warn: missing.length > 0 },
          { n: "Lançado a mais", v: String(extra.length + diff.length), sub: `no sistema: ${centsToBRL(totalSistema)}` },
        ].map((c) => (
          <div key={c.n} className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-sm text-muted">{c.n}</div>
            <div className={`mt-1 font-heading text-2xl font-bold ${c.warn ? "text-amber-300" : ""}`}>{c.v}</div>
            <div className="text-xs text-muted">{c.sub}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">{cardName}: fatura {centsToBRL(totalFatura)} · lançado no sistema {centsToBRL(totalSistema)} · diferença <strong className={totalFatura === totalSistema ? "text-emerald-300" : "text-amber-300"}>{centsToBRL(totalFatura - totalSistema)}</strong></p>

      {limpo && <p className="rounded-2xl bg-emerald-500/10 p-5 text-center text-emerald-300">Tudo conferido: não há diferenças entre a fatura e os seus lançamentos.</p>}

      {missing.length > 0 && (
        <form action={addMissing} className="flex flex-col gap-3 rounded-3xl border border-amber-400/40 bg-surface p-5">
          <input type="hidden" name="id" value={id} />
          <div><h2 className="font-semibold">Na fatura e não lançado ({missing.length})</h2><p className="text-sm text-muted">Compras que apareceram na fatura e não estão no sistema. Marque o que deve ser lançado.</p></div>
          <ul className="divide-y divide-line">
            {missing.map((l) => (
              <li key={idx(l)} className="flex items-center gap-3 py-2 text-sm">
                <input type="checkbox" name="l" value={idx(l)} defaultChecked className="size-5 shrink-0" aria-label={`Lançar ${l.description}`} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{l.description}{l.installment ? ` · ${l.installment.n}/${l.installment.total}` : ""}</div><div className="text-xs text-muted">{dataBR(l.date)}</div></div>
                <div className={`shrink-0 font-semibold ${l.amount_cents < 0 ? "text-emerald-300" : ""}`}>{centsToBRL(l.amount_cents)}</div>
                <button formAction={ignoreItem} name="key" value={`L:${idx(l)}`} className="shrink-0 text-xs text-muted underline">Ignorar</button>
              </li>
            ))}
          </ul>
          <button className="rounded-xl bg-gold px-5 py-3 font-semibold text-canvas hover:brightness-110">Lançar os marcados</button>
          <p className="text-xs text-muted">Entram na fatura de {layout.month.slice(5)}/{layout.month.slice(0, 4)}, classificados por regras, histórico e IA; o que ficar em dúvida vai para a Revisão.</p>
        </form>
      )}

      {diff.length > 0 && (
        <form action={fixAmount} className="flex flex-col gap-3 rounded-3xl border border-amber-400/40 bg-surface p-5">
          <input type="hidden" name="id" value={id} />
          <div><h2 className="font-semibold">Valor diferente ({diff.length})</h2><p className="text-sm text-muted">Mesma compra, valor diferente do que você lançou.</p></div>
          <ul className="divide-y divide-line">
            {diff.map((p) => (
              <li key={p.tx.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.line.description}</div><div className="text-xs text-muted">{dataBR(p.line.date)} · lançado como “{p.tx.description}”</div></div>
                <div className="text-right"><div className="font-semibold">fatura {centsToBRL(p.line.amount_cents)}</div><div className="text-xs text-muted">sistema {centsToBRL(p.tx.amount_cents)}</div></div>
                <button formAction={fixAmount} name="fix" value={`${idx(p.line)}:${p.tx.id}`} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-canvas">Usar o da fatura</button>
                <button formAction={ignoreItem} name="key" value={`T:${p.tx.id}`} className="text-xs text-muted underline">Ignorar</button>
              </li>
            ))}
          </ul>
        </form>
      )}

      {extra.length > 0 && (
        <form action={ignoreItem} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <input type="hidden" name="id" value={id} />
          <div><h2 className="font-semibold">Lançado e não está na fatura ({extra.length})</h2><p className="text-sm text-muted">Pode ser lançamento duplicado, com data ou valor errado, ou compra de outra fatura. Confira em Lançamentos.</p></div>
          <ul className="divide-y divide-line">
            {extra.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{t.description}</div><div className="text-xs text-muted">{dataBR(t.date)}</div></div>
                <div className="shrink-0 font-semibold">{centsToBRL(t.amount_cents)}</div>
                <button formAction={ignoreItem} name="key" value={`T:${t.id}`} className="shrink-0 text-xs text-muted underline">Ignorar</button>
              </li>
            ))}
          </ul>
          <Link href="/lancamentos" className="text-sm text-gold underline">Abrir Lançamentos</Link>
        </form>
      )}

      {r.matched.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm">Ver as {r.matched.length} compras conferidas</summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {r.matched.map((m) => (
              <li key={m.tx.id} className="flex items-center justify-between gap-3 py-1.5"><span className="truncate">{dataBR(m.line.date)} · {m.line.description}</span><span className="shrink-0 text-muted">{centsToBRL(m.line.amount_cents)}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
