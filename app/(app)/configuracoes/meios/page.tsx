import { CrudList, Section, type Field } from "@/components/config/crud";
import { centsToBRL, centsToInput } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { PM_KINDS } from "@/lib/schemas";
import { deletePaymentMethod, savePaymentMethod } from "../actions";

type Row = {
  id: string; name: string; kind: keyof typeof PM_KINDS; holder_person_id: string | null;
  owner_entity_id: string; closing_day: number | null; due_day: number | null;
  credit_limit_cents: number | null; active: boolean;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const [{ data }, { data: people }, { data: ents }] = await Promise.all([
    supabase.from("payment_methods").select("*").order("name"),
    supabase.from("people").select("id, name").order("name"),
    supabase.from("entities").select("id, name").order("name"),
  ]);
  const rows = (data ?? []) as Row[];
  const fields: Field[] = [
    { name: "name", label: "Nome", type: "text", required: true },
    { name: "kind", label: "Tipo", type: "select", required: true,
      options: Object.entries(PM_KINDS).map(([value, label]) => ({ value, label })) },
    { name: "holder_person_id", label: "Titular", type: "select",
      options: ((people ?? []) as { id: string; name: string }[]).map((p) => ({ value: p.id, label: p.name })) },
    { name: "owner_entity_id", label: "De quem é o dinheiro que paga", type: "select", required: true,
      hint: "Se for da Aventure e o gasto for pessoal, vira retirada do sócio.",
      options: ((ents ?? []) as { id: string; name: string }[]).map((e) => ({ value: e.id, label: e.name })) },
    { name: "closing_day", label: "Dia de fechamento", type: "number", hint: "Só para cartão de crédito." },
    { name: "due_day", label: "Dia de vencimento", type: "number", hint: "Só para cartão de crédito." },
    { name: "credit_limit_cents", label: "Limite (R$)", type: "money" },
    { name: "active", label: "Ativo", type: "checkbox" },
  ];
  return (
    <Section title="Meios de pagamento" searchParams={searchParams}
      description="Alterar fechamento ou vencimento vale para as próximas compras; as faturas já lançadas só mudam se forem recalculadas.">
      <CrudList rows={rows} fields={fields} newLabel="Novo meio de pagamento"
        newValues={{ active: "on" }}
        title={(r) => <>{r.name}{!r.active && " (inativo)"}</>}
        subtitle={(r) => r.kind === "credit_card"
          ? `Fecha dia ${r.closing_day ?? "a confirmar"} · vence dia ${r.due_day ?? "a confirmar"} · limite ${centsToBRL(r.credit_limit_cents)}`
          : PM_KINDS[r.kind]}
        valuesOf={(r) => ({
          name: r.name, kind: r.kind, holder_person_id: r.holder_person_id ?? "", owner_entity_id: r.owner_entity_id,
          closing_day: r.closing_day?.toString() ?? "", due_day: r.due_day?.toString() ?? "",
          credit_limit_cents: centsToInput(r.credit_limit_cents), active: r.active ? "on" : "",
        })}
        saveAction={savePaymentMethod} deleteAction={deletePaymentMethod} />
    </Section>
  );
}
