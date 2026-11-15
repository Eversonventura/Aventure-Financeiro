import { RecordForm, Section, type Field } from "@/components/config/crud";
import { centsToInput, percentToInput } from "@/lib/format";
import { getCtx } from "@/lib/org";
import { saveSettings } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { supabase } = await getCtx();
  const { data } = await supabase.from("org_settings").select("simples_effective_rate, opening_balance_cents, opening_balance_date").maybeSingle();
  const rate = data?.simples_effective_rate as number | null | undefined;
  const saldo = (data?.opening_balance_cents as number | undefined) ?? 0;
  const saldoData = (data?.opening_balance_date as string | null | undefined) ?? "";
  const fields: Field[] = [
    { name: "simples_effective_rate", label: "Alíquota efetiva do Simples Nacional (%)", type: "percent",
      hint: "Confirme com a contadora (anexo III ou V, Fator R e se a apuração é por caixa ou competência)." },
    { name: "opening_balance_cents", label: "Saldo em contas (R$)", type: "text",
      hint: "Some o que há hoje nas contas (Asaas, Nubank, Itaú…). É o ponto de partida do fluxo de caixa projetado. Pode ser negativo." },
    { name: "opening_balance_date", label: "Saldo referente ao dia", type: "date", hint: "Normalmente hoje." },
  ];
  return (
    <Section title="Geral" searchParams={searchParams}>
      <RecordForm action={saveSettings} fields={fields}
        values={{ simples_effective_rate: percentToInput(rate == null ? null : Math.round(rate * 1000000) / 10000), opening_balance_cents: saldo === 0 ? "" : (saldo < 0 ? "-" : "") + centsToInput(Math.abs(saldo)), opening_balance_date: saldoData }} />
    </Section>
  );
}
