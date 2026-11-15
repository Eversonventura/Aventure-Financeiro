import Link from "next/link";
import { ContaRow, type ContaView } from "@/components/conta-row";
import { diffDays, monthEnd, monthLabel, monthStart, todayFortaleza } from "@/lib/dates";
import { centsToBRL } from "@/lib/format";
import { addInvoiceMonths, cashDateFor } from "@/lib/invoice";
import { getCtx } from "@/lib/org";
import { generateNow } from "./actions";

type Tx = {
  id: string; type: "income" | "expense"; status: "forecast" | "pending" | "paid"; description: string;
  amount_cents: number; paid_amount_cents: number | null; cash_date: string; source: string;
  payment_method_id: string | null; entity_id: string;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(hoje);
  const ant = addInvoiceMonths(mes, -1).slice(0, 7);
  const prox = addInvoiceMonths(mes, 1).slice(0, 7);

  const { supabase } = await getCtx();
  const [txs, pms, ents, inv] = await Promise.all([
    supabase.from("transactions").select("id, type, status, description, amount_cents, paid_amount_cents, cash_date, source, payment_method_id, entity_id")
      .in("type", ["income", "expense"]).gte("cash_date", mes).lte("cash_date", monthEnd(mes)).order("cash_date"),
    supabase.from("payment_methods").select("id, name, kind, due_day"),
    supabase.from("entities").select("id, name"),
    supabase.from("v_card_invoices").select("payment_method_id, payment_method, total_cents").eq("invoice_month", mes),
  ]);
  const methods = new Map((pms.data ?? []).map((p) => [p.id as string, p as { id: string; name: string; kind: string; due_day: number | null }]));
  const ent = new Map((ents.data ?? []).map((e) => [e.id as string, e.name as string]));

  // contas = o que ainda é obrigação (previsto/pendente) ou veio de recorrência; compra no cartão entra na fatura
  const contas: ContaView[] = ((txs.data ?? []) as Tx[])
    .filter((t) => methods.get(t.payment_method_id ?? "")?.kind !== "credit_card")
    .filter((t) => t.status !== "paid" || t.source === "recurring")
    .map((t) => {
      const paid = t.status === "paid";
      const kind = t.type === "income" ? "receber" : "pagar";
      const dias = diffDays(hoje, t.cash_date);
      const [label, tone] = paid
        ? [kind === "receber" ? "Recebido" : "Pago", "ok" as const]
        : dias < 0 ? [kind === "receber" ? "Atrasado" : "Vencida", "late" as const]
        : dias <= 7 ? [kind === "receber" ? "Recebe em breve" : "Vence em breve", "warn" as const]
        : [kind === "receber" ? "A receber" : "A pagar", "plain" as const];
      return {
        id: t.id, description: t.description, amount_cents: t.amount_cents, paid_amount_cents: t.paid_amount_cents,
        due: t.cash_date, kind, paid, label, tone, sub: `${ent.get(t.entity_id) ?? "—"}${t.payment_method_id ? ` · ${methods.get(t.payment_method_id)?.name ?? ""}` : ""}`,
      };
    });

  const aPagar = contas.filter((c) => c.kind === "pagar" && !c.paid).reduce((s, c) => s + c.amount_cents, 0);
  const aReceber = contas.filter((c) => c.kind === "receber" && !c.paid).reduce((s, c) => s + c.amount_cents, 0);
  const faturas = (inv.data ?? []).map((f) => {
    const m = methods.get(f.payment_method_id as string);
    return { id: f.payment_method_id as string, nome: f.payment_method as string, total: f.total_cents as number, due: m?.due_day ? cashDateFor(mes, m.due_day) : null };
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href={`/contas?mes=${ant}`} className="rounded-lg border border-zinc-300 px-3 py-1.5" aria-label="Mês anterior">‹</Link>
        <h1 className="text-xl font-semibold capitalize">{monthLabel(mes)}</h1>
        <Link href={`/contas?mes=${prox}`} className="rounded-lg border border-zinc-300 px-3 py-1.5" aria-label="Próximo mês">›</Link>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{sp.erro}</p>}

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl border border-zinc-200 bg-white p-3"><div className="text-zinc-500">A pagar</div><div className="font-semibold">{centsToBRL(aPagar)}</div></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3"><div className="text-zinc-500">A receber</div><div className="font-semibold text-green-700">{centsToBRL(aReceber)}</div></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3"><div className="text-zinc-500">Saldo</div><div className="font-semibold">{centsToBRL(aReceber - aPagar)}</div></div>
      </div>

      {contas.length === 0 && (
        <p className="text-zinc-500">Nenhuma conta neste mês. Cadastre as contas fixas em Configurações → Recorrências e gere o mês.</p>
      )}
      <ul className="flex flex-col gap-2">
        {contas.map((c) => <ContaRow key={c.id} c={c} mes={mes.slice(0, 7)} />)}
      </ul>

      {faturas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Faturas dos cartões</h2>
          {faturas.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-3">
              <div><div className="font-medium">{f.nome}</div><div className="text-sm text-zinc-500">{f.due ? `vence ${f.due.slice(8, 10)}/${f.due.slice(5, 7)}` : "vencimento a confirmar"}</div></div>
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
