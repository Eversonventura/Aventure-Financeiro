import { InicioView } from "@/components/inicio-view";
import { loadContasDoMes } from "@/lib/contas";
import { monthEnd, monthStart, todayFortaleza } from "@/lib/dates";
import { dailyTotals, monthTotals, type HomeTx } from "@/lib/inicio";
import { getCtx } from "@/lib/org";

const SHOW = 30;

type Row = {
  id: string; type: "income" | "expense"; description: string; amount_cents: number; paid_amount_cents: number | null; status: string;
  competence_date: string; entity_id: string; payment_method_id: string | null; category_id: string | null;
  installment_group_id: string | null; installment_number: number | null; needs_review: boolean; receipt_path: string | null;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const hoje = todayFortaleza();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : monthStart(hoje);
  const { supabase } = await getCtx();

  const [txs, ents, pms, cats, contas, rev] = await Promise.all([
    supabase.from("transactions")
      .select("id, type, description, amount_cents, paid_amount_cents, status, competence_date, entity_id, payment_method_id, category_id, installment_group_id, installment_number, needs_review, receipt_path")
      .in("type", ["income", "expense"]).gte("competence_date", mes).lte("competence_date", monthEnd(mes))
      .order("competence_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("entities").select("id, name"),
    supabase.from("payment_methods").select("id, name"),
    supabase.from("categories").select("id, name"),
    loadContasDoMes(supabase, monthStart(hoje), hoje),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);

  const rows = (txs.data ?? []) as Row[];
  const name = (l: { data: { id: string; name: string }[] | null }) => new Map((l.data ?? []).map((x) => [x.id, x.name]));
  const [ent, pm, cat] = [name(ents), name(pms), name(cats)];

  const groupIds = [...new Set(rows.map((r) => r.installment_group_id).filter((x): x is string => !!x))];
  const { data: groups } = groupIds.length ? await supabase.from("installment_groups").select("id, installments").in("id", groupIds) : { data: [] as { id: string; installments: number }[] };
  const total = new Map((groups ?? []).map((g) => [g.id, g.installments]));

  const all: HomeTx[] = rows.map((r) => ({
    id: r.id, type: r.type, description: r.description, amount_cents: r.amount_cents, paid_amount_cents: r.paid_amount_cents, status: r.status,
    competence_date: r.competence_date, entity: ent.get(r.entity_id) ?? "—", method: pm.get(r.payment_method_id ?? "") ?? "sem meio",
    category: r.category_id ? cat.get(r.category_id) ?? null : null,
    installment: r.installment_number ? `${r.installment_number}/${total.get(r.installment_group_id ?? "") ?? "?"}` : null,
    needsReview: r.needs_review, receiptPath: r.receipt_path,
  }));

  return (
    <InicioView
      mes={mes} totals={monthTotals(all)} daily={dailyTotals(all, mes)} txs={all.slice(0, SHOW)} hasMore={all.length > SHOW}
      aPagar={contas.aPagar} aReceber={contas.aReceber} atrasadas={contas.atrasadas} revisar={rev.count ?? 0}
    />
  );
}
