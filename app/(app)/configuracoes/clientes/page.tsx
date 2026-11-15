import { CrudList, Section, type Field } from "@/components/config/crud";
import { getCtx } from "@/lib/org";
import { deleteClient, saveClient } from "../actions";

const fields: Field[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "document", label: "CNPJ/CPF (opcional)", type: "text" },
  { name: "asaas_customer_id", label: "ID do cliente no Asaas (opcional)", type: "text" },
  { name: "active", label: "Ativo", type: "checkbox" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const { data } = await supabase.from("clients").select("*").order("name");
  const rows = (data ?? []) as { id: string; name: string; document: string | null; asaas_customer_id: string | null; active: boolean }[];
  return (
    <Section title="Clientes" searchParams={searchParams} description="Quem paga a Aventure. Alimenta a receita do DRE por cliente.">
      <CrudList rows={rows} fields={fields} newLabel="Novo cliente" newValues={{ active: "on" }}
        title={(r) => <>{r.name}{!r.active && " (inativo)"}</>} subtitle={(r) => r.document ?? "Sem documento"}
        valuesOf={(r) => ({ name: r.name, document: r.document ?? "", asaas_customer_id: r.asaas_customer_id ?? "", active: r.active ? "on" : "" })}
        saveAction={saveClient} deleteAction={deleteClient}
        deleteConfirm={(r) => `Apagar "${r.name}"? Os lançamentos ficam sem cliente e as cobranças mensais dele são desativadas.`} />
    </Section>
  );
}
