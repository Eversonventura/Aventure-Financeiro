import { z } from "zod";
import type { Grid } from "@/lib/sheet/read";

export const REGION_KINDS = {
  monthly_bills: "Gastos mensais (contas com vencimento)",
  income: "Recebimentos",
  card_purchases: "Compras do cartão",
  invoice_total: "Total da fatura (não importa)",
  ignore: "Ignorar",
} as const;
export type RegionKind = keyof typeof REGION_KINDS;

const kinds = Object.keys(REGION_KINDS) as [RegionKind, ...RegionKind[]];

export const regionSchema = z
  .object({
    id: z.string().min(1).max(40),
    sheet: z.string().min(1),
    kind: z.enum(kinds),
    label: z.string().max(120).default(""),
    // mês de referência do bloco: fatura (cartão) ou mês de caixa (gastos e recebimentos)
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),
    card: z.string().max(80).nullable().default(null), // nome do cartão como aparece na planilha
    cardId: z.uuid().nullable().default(null), // meio de pagamento escolhido na conferência
    firstRow: z.number().int().min(1),
    lastRow: z.number().int().min(1),
    valueCol: z.number().int().min(1).max(200),
    descriptionCol: z.number().int().min(1).max(200),
    dateCol: z.number().int().min(1).max(200).nullable().default(null),
  })
  .refine((r) => r.lastRow >= r.firstRow, { error: "lastRow antes de firstRow" });

export const layoutSchema = z.object({
  regions: z.array(regionSchema).max(200),
  notes: z.string().max(2000).optional(),
});
export type Region = z.infer<typeof regionSchema>;
export type Layout = z.infer<typeof layoutSchema>;

/** Descarta regiões que apontam para fora da planilha e devolve avisos. */
export function sanitizeLayout(layout: Layout, grids: Grid[]): { layout: Layout; warnings: string[] } {
  const warnings: string[] = [];
  const bySheet = new Map(grids.map((g) => [g.name, g]));
  const seen = new Set<string>();
  const regions = layout.regions.filter((r) => {
    const g = bySheet.get(r.sheet);
    if (!g) { warnings.push(`Bloco "${r.label || r.id}": aba "${r.sheet}" não existe.`); return false; }
    if (r.firstRow > g.rows.length) { warnings.push(`Bloco "${r.label || r.id}": linhas fora da planilha.`); return false; }
    if (seen.has(r.id)) { warnings.push(`Bloco repetido: ${r.id}`); return false; }
    seen.add(r.id);
    return true;
  });
  return { layout: { ...layout, regions }, warnings };
}
