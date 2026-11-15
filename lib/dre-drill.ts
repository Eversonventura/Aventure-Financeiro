import type { SupabaseClient } from "@supabase/supabase-js";
import { addInvoiceMonths } from "@/lib/invoice";
import { DRE_LINE_TITLES } from "@/lib/dre";

export type DrillItem = {
  id: string; date: string; description: string; entity: string; category: string; method: string;
  cents: number; // valor que entra na linha (já com o rateio e o valor real pago)
  note?: string;
};
export type Drill = { title: string; items: DrillItem[]; total: number; notes: string[]; known: boolean };

type Tx = {
  id: string; type: "income" | "expense"; status: string; description: string; amount_cents: number; paid_amount_cents: number | null;
  competence_date: string; entity_id: string; category_id: string | null; payment_method_id: string | null;
};
const eff = (t: Tx) => (t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : t.amount_cents);

/** Lançamentos que formam uma linha do DRE no mês (mesmas regras da view v_dre_monthly). */
export async function loadDrill(supabase: SupabaseClient, linha: string, month: string, rate: number | null): Promise<Drill> {
  const title = DRE_LINE_TITLES[linha];
  if (!title) return { title: "", items: [], total: 0, notes: [], known: false };
  const to = addInvoiceMonths(month, 1);

  const [ents, cats, pms, txs] = await Promise.all([
    supabase.from("entities").select("id, name, kind"),
    supabase.from("categories").select("id, name, dre_line, pj_share_pct"),
    supabase.from("payment_methods").select("id, name, owner_entity_id"),
    supabase.from("transactions").select("id, type, status, description, amount_cents, paid_amount_cents, competence_date, entity_id, category_id, payment_method_id")
      .in("type", ["income", "expense"]).gte("competence_date", month).lt("competence_date", to).order("competence_date").limit(3000),
  ]);
  const ent = new Map((ents.data ?? []).map((e) => [e.id as string, e as { id: string; name: string; kind: "pj" | "pf" | "shared" }]));
  const cat = new Map((cats.data ?? []).map((c) => [c.id as string, c as { id: string; name: string; dre_line: string; pj_share_pct: number }]));
  const pm = new Map((pms.data ?? []).map((p) => [p.id as string, p as { id: string; name: string; owner_entity_id: string }]));
  const all = (txs.data ?? []) as Tx[];

  const item = (t: Tx, cents: number, note?: string): DrillItem => ({
    id: t.id, date: t.competence_date, description: t.description, entity: ent.get(t.entity_id)?.name ?? "—",
    category: cat.get(t.category_id ?? "")?.name ?? "sem categoria", method: pm.get(t.payment_method_id ?? "")?.name ?? "—", cents, note,
  });
  const notes: string[] = [];
  const items: DrillItem[] = [];

  if (linha === "retiradas") {
    for (const t of all) {
      const e = ent.get(t.entity_id);
      const owner = pm.get(t.payment_method_id ?? "") ? ent.get(pm.get(t.payment_method_id!)!.owner_entity_id) : undefined;
      if (t.type === "expense" && e && e.kind !== "pj" && owner?.kind === "pj") items.push(item(t, eff(t), "gasto pessoal pago pela empresa"));
      else if (t.type === "expense" && e?.kind === "pj" && cat.get(t.category_id ?? "")?.dre_line === "distribution") items.push(item(t, eff(t), "distribuição de lucros"));
    }
    notes.push("Retirada = gasto de pessoa física ou da casa pago por um meio da Aventure, mais a distribuição de lucros lançada.");
  } else {
    // as linhas do DRE vêm das categorias; income soma na receita, expense nos custos (estorno abate)
    const revenue = linha === "gross_revenue" || linha === "financial";
    for (const t of all) {
      const c = cat.get(t.category_id ?? "");
      const e = ent.get(t.entity_id);
      if (!c || !e) continue;
      const sign = (t.type === "income") === revenue ? 1 : -1;
      if (e.kind === "pj" && c.dre_line === linha) items.push(item(t, sign * eff(t)));
      if (linha === "structure_expenses" && e.kind === "shared" && t.type === "expense" && c.pj_share_pct > 0) {
        items.push(item(t, Math.round((eff(t) * c.pj_share_pct) / 100), `rateio de ${String(c.pj_share_pct).replace(".", ",")}% do valor da casa`));
      }
    }
    if (linha === "tax" && rate != null) notes.push(`Sem DAS pago lançado, o DRE usa a alíquota efetiva de ${(rate * 100).toFixed(2).replace(".", ",")}% sobre a receita bruta.`);
    if (linha === "financial") notes.push("Rendimentos somam; tarifas e juros subtraem.");
  }
  return { title, items, total: items.reduce((s, i) => s + i.cents, 0), notes, known: true };
}
