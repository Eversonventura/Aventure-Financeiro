import { CrudList, Section, type Field } from "@/components/config/crud";
import { centsToBRL, centsToInput } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { deleteRecurringRule, saveRecurringRule } from "../actions";

type Row = {
  id: string; direction: "in" | "out"; description: string; amount_cents: number; day_of_month: number;
  start_month: string; end_month: string | null; entity_id: string; category_id: string | null;
  payment_method_id: string | null; client_id: string | null; active: boolean;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const [rules, ents, cats, pms, cls] = await Promise.all([
    supabase.from("recurring_rules").select("*").order("description"),
    supabase.from("entities").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("payment_methods").select("id, name").eq("active", true).order("name"),
    supabase.from("clients").select("id, name").eq("active", true).order("name"),
  ]);
  const opts = (l: { data: { id: string; name: string }[] | null }) => (l.data ?? []).map((x) => ({ value: x.id, label: x.name }));
  const fields: Field[] = [
    { name: "direction", label: "Tipo", type: "select", required: true, options: [{ value: "out", label: "Saída (conta, assinatura)" }, { value: "in", label: "Entrada (mensalidade de cliente)" }] },
    { name: "description", label: "Descrição", type: "text", required: true },
    { name: "amount_cents", label: "Valor previsto (R$)", type: "money", required: true },
    { name: "day_of_month", label: "Dia do mês", type: "number", required: true, hint: "Dia 31 vale o último dia dos meses mais curtos." },
    { name: "start_month", label: "Começa em", type: "month", required: true },
    { name: "end_month", label: "Termina em (opcional)", type: "month" },
    { name: "entity_id", label: "De quem é", type: "select", required: true, options: opts(ents) },
    { name: "category_id", label: "Categoria", type: "select", options: opts(cats) },
    { name: "payment_method_id", label: "Meio de pagamento", type: "select", options: opts(pms) },
    { name: "client_id", label: "Cliente (para mensalidades)", type: "select", options: opts(cls) },
    { name: "active", label: "Ativa", type: "checkbox" },
  ];
  return (
    <Section title="Recorrências" searchParams={searchParams}
      description="Todo dia o sistema gera os lançamentos previstos do mês a partir destas regras. Gerar de novo nunca duplica. Mudanças valem para os meses que ainda não foram gerados.">
      <CrudList rows={(rules.data ?? []) as Row[]} fields={fields} newLabel="Nova recorrência" newValues={{ active: "on", direction: "out" }}
        title={(r) => <>{r.description}{!r.active && " (inativa)"}</>}
        subtitle={(r) => `${r.direction === "in" ? "Entrada" : "Saída"} · ${centsToBRL(r.amount_cents)} · dia ${r.day_of_month} · desde ${r.start_month.slice(0, 7)}${r.end_month ? ` até ${r.end_month.slice(0, 7)}` : ""}`}
        valuesOf={(r) => ({
          direction: r.direction, description: r.description, amount_cents: centsToInput(r.amount_cents),
          day_of_month: String(r.day_of_month), start_month: r.start_month.slice(0, 7), end_month: r.end_month?.slice(0, 7) ?? "",
          entity_id: r.entity_id, category_id: r.category_id ?? "", payment_method_id: r.payment_method_id ?? "",
          client_id: r.client_id ?? "", active: r.active ? "on" : "",
        })}
        saveAction={saveRecurringRule} deleteAction={deleteRecurringRule} />
    </Section>
  );
}
