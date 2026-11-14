import { CrudList, Section, type Field } from "@/components/config/crud";
import { percentToInput } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { DRE_LINES, ENTITY_KINDS, NATURES } from "@/lib/schemas";
import { deleteCategory, saveCategory } from "../actions";

type Row = {
  id: string; name: string; applies_to: keyof typeof ENTITY_KINDS | null; direction: "in" | "out";
  dre_line: keyof typeof DRE_LINES; nature: keyof typeof NATURES | null; pj_share_pct: number;
};

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const fields: Field[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "direction", label: "Direção", type: "select", required: true, options: [{ value: "out", label: "Saída" }, { value: "in", label: "Entrada" }] },
  { name: "applies_to", label: "Vale para", type: "select", options: opts(ENTITY_KINDS), hint: "Vazio = qualquer entidade." },
  { name: "dre_line", label: "Linha do DRE", type: "select", required: true, options: opts(DRE_LINES), hint: "Só vale para a Aventure (PJ)." },
  { name: "nature", label: "Natureza (para o analista)", type: "select", options: opts(NATURES) },
  { name: "pj_share_pct", label: "Rateio para a Aventure (%)", type: "percent", hint: "Ex.: internet da casa com 30% → 30% vai para Despesas de estrutura e 70% fica na Casa." },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const { data } = await supabase.from("categories").select("*").order("direction", { ascending: false }).order("name");
  const rows = (data ?? []) as Row[];
  return (
    <Section title="Categorias" searchParams={searchParams}
      description="Cada categoria aponta para uma linha do DRE. A natureza é só uma sugestão inicial para o analista.">
      <CrudList rows={rows} fields={fields} newLabel="Nova categoria" newValues={{ direction: "out", dre_line: "none", pj_share_pct: "0" }}
        title={(r) => r.name}
        subtitle={(r) => [r.direction === "in" ? "Entrada" : "Saída", r.applies_to ? ENTITY_KINDS[r.applies_to] : "Qualquer entidade",
          DRE_LINES[r.dre_line], r.nature ? NATURES[r.nature] : null, r.pj_share_pct > 0 ? `rateio ${percentToInput(r.pj_share_pct)}%` : null]
          .filter(Boolean).join(" · ")}
        valuesOf={(r) => ({ name: r.name, direction: r.direction, applies_to: r.applies_to ?? "", dre_line: r.dre_line,
          nature: r.nature ?? "", pj_share_pct: percentToInput(r.pj_share_pct) })}
        saveAction={saveCategory} deleteAction={deleteCategory} />
    </Section>
  );
}
