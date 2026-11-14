import { CrudList, Section, type Field } from "@/components/config/crud";
import { getCtx } from "@/lib/org";
import { ENTITY_KINDS } from "@/lib/schemas";
import { deleteEntity, saveEntity } from "../actions";

const fields: Field[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "kind", label: "Tipo", type: "select", required: true,
    options: Object.entries(ENTITY_KINDS).map(([value, label]) => ({ value, label })) },
  { name: "document", label: "CNPJ/CPF (opcional)", type: "text" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const { data } = await supabase.from("entities").select("*").order("name");
  const rows = (data ?? []) as { id: string; name: string; kind: keyof typeof ENTITY_KINDS; document: string | null }[];
  return (
    <Section title="Entidades" searchParams={searchParams}
      description="Quem arca com o gasto ou recebe a entrada. Só a Aventure (PJ) entra no DRE.">
      <CrudList rows={rows} fields={fields} newLabel="Nova entidade"
        title={(r) => r.name} subtitle={(r) => ENTITY_KINDS[r.kind]}
        valuesOf={(r) => ({ name: r.name, kind: r.kind, document: r.document ?? "" })}
        saveAction={saveEntity} deleteAction={deleteEntity} />
    </Section>
  );
}
