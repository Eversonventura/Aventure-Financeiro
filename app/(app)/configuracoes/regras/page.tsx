import { CrudList, Section, type Field } from "@/components/config/crud";
import { getCtx } from "@/lib/org";
import { deleteClassificationRule, saveClassificationRule } from "../actions";

type Row = {
  id: string; match_text: string; match_kind: "contains" | "equals"; payment_method_id: string | null;
  entity_id: string | null; category_id: string | null; person_id: string | null; hits: number;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const [rules, ents, cats, pms, people] = await Promise.all([
    supabase.from("classification_rules").select("*").order("hits", { ascending: false }).order("match_text"),
    supabase.from("entities").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("payment_methods").select("id, name").order("name"),
    supabase.from("people").select("id, name").order("name"),
  ]);
  const list = (l: { data: { id: string; name: string }[] | null }) => l.data ?? [];
  const opts = (l: { data: { id: string; name: string }[] | null }) => list(l).map((x) => ({ value: x.id, label: x.name }));
  const nome = (l: { data: { id: string; name: string }[] | null }) => new Map(list(l).map((x) => [x.id, x.name]));
  const [en, ca, pm] = [nome(ents), nome(cats), nome(pms)];
  const fields: Field[] = [
    { name: "match_text", label: "Quando a descrição tiver", type: "text", required: true, hint: "Sem acento e em minúsculas, como o sistema compara. Ex.: guara." },
    { name: "match_kind", label: "Comparar", type: "select", required: true, options: [{ value: "contains", label: "Contém o texto" }, { value: "equals", label: "É exatamente o texto" }] },
    { name: "entity_id", label: "Então a entidade é", type: "select", options: opts(ents) },
    { name: "category_id", label: "E a categoria é", type: "select", options: opts(cats) },
    { name: "person_id", label: "E a pessoa é (opcional)", type: "select", options: opts(people) },
    { name: "payment_method_id", label: "Só neste meio (opcional)", type: "select", options: opts(pms) },
  ];
  return (
    <Section title="Regras de classificação" searchParams={searchParams}
      description="O sistema aprende com as respostas da fila de revisão e com lançamentos repetidos. Regras valem antes da IA, então não gastam chamada.">
      <CrudList rows={(rules.data ?? []) as Row[]} fields={fields} newLabel="Nova regra" newValues={{ match_kind: "contains" }}
        title={(r) => <>“{r.match_text}” <span className="text-muted">({r.match_kind === "equals" ? "exato" : "contém"})</span></>}
        subtitle={(r) => [r.entity_id ? en.get(r.entity_id) : null, r.category_id ? ca.get(r.category_id) : null, r.payment_method_id ? `só ${pm.get(r.payment_method_id)}` : null, `usada ${r.hits}×`].filter(Boolean).join(" · ")}
        valuesOf={(r) => ({ match_text: r.match_text, match_kind: r.match_kind, entity_id: r.entity_id ?? "", category_id: r.category_id ?? "", person_id: r.person_id ?? "", payment_method_id: r.payment_method_id ?? "" })}
        saveAction={saveClassificationRule} deleteAction={deleteClassificationRule} />
    </Section>
  );
}
