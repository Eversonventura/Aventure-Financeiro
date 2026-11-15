import Link from "next/link";
import { centsToBRL } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { deleteLaunch } from "./actions";

type Tx = {
  id: string; type: "expense" | "income" | "transfer"; description: string; amount_cents: number;
  competence_date: string; cash_date: string; invoice_month: string | null; status: string;
  entity_id: string; payment_method_id: string | null; category_id: string | null;
  installment_group_id: string | null; installment_number: number | null; transfer_pair_id: string | null; needs_review: boolean;
};

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const { supabase } = await getCtx();
  const [{ data }, ents, pms, cats] = await Promise.all([
    supabase.from("transactions").select("*").order("competence_date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    supabase.from("entities").select("id, name"),
    supabase.from("payment_methods").select("id, name"),
    supabase.from("categories").select("id, name"),
  ]);
  const rows = (data ?? []) as Tx[];
  const nome = (l: { data: { id: string; name: string }[] | null }) => new Map((l.data ?? []).map((x) => [x.id, x.name]));
  const ent = nome(ents), pm = nome(pms), cat = nome(cats);

  const groupIds = [...new Set(rows.map((r) => r.installment_group_id).filter((x): x is string => !!x))];
  const { data: groups } = groupIds.length
    ? await supabase.from("installment_groups").select("id, installments").in("id", groupIds)
    : { data: [] as { id: string; installments: number }[] };
  const total = new Map((groups ?? []).map((g) => [g.id, g.installments]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lançamentos</h1>
        <Link href="/lancamentos/novo" className="rounded-lg bg-zinc-900 px-4 py-2 text-white">Novo</Link>
      </div>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{erro}</p>}
      {rows.length === 0 && <p className="text-zinc-500">Nenhum lançamento ainda. Toque em “Novo”.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const sinal = r.type === "income" ? "+" : r.type === "expense" ? "−" : "↔";
          return (
            <li key={r.id} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {r.description}
                    {r.installment_number && ` · ${r.installment_number}/${total.get(r.installment_group_id ?? "") ?? "?"}`}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {dataBR(r.competence_date)} · {ent.get(r.entity_id) ?? "—"} · {pm.get(r.payment_method_id ?? "") ?? "sem meio"}
                    {r.category_id ? ` · ${cat.get(r.category_id)}` : r.type !== "transfer" ? " · sem categoria" : ""}
                  </div>
                  {r.invoice_month && (
                    <div className="text-xs text-zinc-400">fatura vence {dataBR(r.cash_date)}</div>
                  )}
                  {r.needs_review && <div className="text-xs text-amber-700">Precisa de revisão</div>}
                </div>
                <div className={`shrink-0 font-semibold ${r.type === "income" ? "text-green-700" : ""}`}>
                  {sinal} {centsToBRL(r.amount_cents)}
                </div>
              </div>
              <form action={deleteLaunch} className="mt-1 text-right">
                <input type="hidden" name="id" value={r.id} />
                {r.installment_group_id && <input type="hidden" name="group" value={r.installment_group_id} />}
                {r.transfer_pair_id && <input type="hidden" name="pair" value={r.transfer_pair_id} />}
                <button className="text-xs text-red-600 underline">
                  {r.installment_group_id ? "Apagar compra parcelada" : "Apagar"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
