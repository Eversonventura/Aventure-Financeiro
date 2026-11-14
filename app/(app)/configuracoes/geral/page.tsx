import { RecordForm, Section, type Field } from "@/components/config/crud";
import { percentToInput } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { saveSettings } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const { data } = await supabase.from("org_settings").select("simples_effective_rate").maybeSingle();
  const rate = data?.simples_effective_rate as number | null | undefined;
  const fields: Field[] = [
    { name: "simples_effective_rate", label: "Alíquota efetiva do Simples Nacional (%)", type: "percent",
      hint: "Confirme com a contadora (anexo III ou V, Fator R e se a apuração é por caixa ou competência)." },
  ];
  return (
    <Section title="Geral" searchParams={searchParams}>
      <RecordForm action={saveSettings} fields={fields}
        values={{ simples_effective_rate: percentToInput(rate == null ? null : Math.round(rate * 1000000) / 10000) }} />
    </Section>
  );
}
