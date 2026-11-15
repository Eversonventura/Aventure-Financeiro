import { CrudList, Section, type Field } from "@/components/config/crud";
import { getCtx } from "@/lib/org";
import { deletePerson, savePerson } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const [{ data: people }, { data: ents }] = await Promise.all([
    supabase.from("people").select("*").order("name"),
    supabase.from("entities").select("id, name").order("name"),
  ]);
  const entities = (ents ?? []) as { id: string; name: string }[];
  const nome = new Map(entities.map((e) => [e.id, e.name]));
  const rows = (people ?? []) as { id: string; name: string; user_id: string | null; default_entity_id: string | null }[];
  const fields: Field[] = [
    { name: "name", label: "Nome", type: "text", required: true },
    { name: "default_entity_id", label: "Entidade padrão dos gastos", type: "select",
      options: entities.map((e) => ({ value: e.id, label: e.name })) },
  ];
  return (
    <Section title="Pessoas" searchParams={searchParams}
      description="Quem faz o gasto. Quem não tem login (por exemplo, um familiar) tem os gastos lançados por Ventura ou Amanda.">
      <CrudList rows={rows} fields={fields} newLabel="Nova pessoa"
        title={(r) => r.name}
        subtitle={(r) => `${r.user_id ? "Com login" : "Sem login"} · padrão: ${nome.get(r.default_entity_id ?? "") ?? "—"}`}
        valuesOf={(r) => ({ name: r.name, default_entity_id: r.default_entity_id ?? "" })}
        saveAction={savePerson} deleteAction={deletePerson}
        deleteConfirm={(r) => `Apagar "${r.name}"? Os lançamentos e cartões ligados a esta pessoa ficam sem pessoa.`} />
    </Section>
  );
}
