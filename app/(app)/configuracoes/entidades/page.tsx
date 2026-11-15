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
        saveAction={saveEntity} deleteAction={deleteEntity}
        deleteConfirm={(r) => `Apagar "${r.name}"? Tudo que usa esta entidade (lançamentos, cartões, regras) será movido para a entidade escolhida.`}
        renderDelete={(r) => (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Para apagar, mova o que usa “{r.name}” para:</span>
            <select name="move_to" required defaultValue={rows.find((x) => x.id !== r.id && x.kind === "shared")?.id ?? rows.find((x) => x.id !== r.id)?.id}
              className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 text-ink">
              {rows.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )} />
    </Section>
  );
}
