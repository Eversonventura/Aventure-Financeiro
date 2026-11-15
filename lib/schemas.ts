import { z } from "zod";
import { brlToCents, parsePercent } from "@/lib/format";

export const ENTITY_KINDS = { pj: "Empresa (PJ)", pf: "Pessoa (PF)", shared: "Compartilhado" } as const;
export const PM_KINDS = { credit_card: "Cartão de crédito", bank_account: "Conta bancária", pix: "Pix", cash: "Dinheiro" } as const;
export const DRE_LINES = {
  gross_revenue: "Receita bruta", tax: "Simples Nacional (DAS)", deductions: "Cancelamentos e descontos",
  cost_of_services: "Custo dos serviços", admin_expenses: "Despesas administrativas",
  sales_expenses: "Despesas comerciais", structure_expenses: "Despesas de estrutura",
  pro_labore: "Pró-labore", financial: "Resultado financeiro", distribution: "Distribuição e retiradas",
  none: "Fora do DRE",
} as const;
export const NATURES = { essential: "Essencial", important: "Importante", superfluous: "Supérfluo" } as const;

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

const text = (msg: string) => z.string().trim().min(1, { error: msg });
const optText = z.string().trim().transform((s) => (s === "" ? null : s)).nullable();
const optUuid = z.union([z.uuid(), z.literal("")]).transform((s) => (s === "" ? null : s)).nullable();
const optEnum = <T extends [string, ...string[]]>(vals: T) =>
  z.union([z.enum(vals), z.literal("")]).transform((s) => (s === "" ? null : (s as T[number]))).nullable();
const optDay = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      ctx.addIssue({ code: "custom", message: "O dia deve estar entre 1 e 31." });
      return z.NEVER;
    }
    return n;
  });
const money = z.string().transform((s, ctx) => {
  const c = brlToCents(s);
  if (Number.isNaN(c)) {
    ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 300,00." });
    return z.NEVER;
  }
  return c;
});
const bool = z.string().transform((s) => s === "on");

export const entitySchema = z.object({
  name: text("Informe o nome."),
  kind: z.enum(keys(ENTITY_KINDS), { error: "Escolha o tipo." }),
  document: optText,
});

export const personSchema = z.object({
  name: text("Informe o nome."),
  default_entity_id: optUuid,
});

export const paymentMethodSchema = z.object({
  name: text("Informe o nome."),
  kind: z.enum(keys(PM_KINDS), { error: "Escolha o tipo." }),
  holder_person_id: optUuid,
  owner_entity_id: z.uuid({ error: "Escolha de quem é o dinheiro que paga este meio." }),
  closing_day: optDay,
  due_day: optDay,
  credit_limit_cents: money,
  active: bool,
});

export const categorySchema = z.object({
  name: text("Informe o nome."),
  applies_to: optEnum(keys(ENTITY_KINDS)),
  direction: z.enum(["in", "out"], { error: "Escolha entrada ou saída." }),
  dre_line: z.enum(keys(DRE_LINES), { error: "Escolha a linha do DRE." }),
  nature: optEnum(keys(NATURES)),
  pj_share_pct: z.string().transform((s, ctx) => {
    const n = parsePercent(s) ?? 0;
    if (Number.isNaN(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: "custom", message: "O rateio deve estar entre 0 e 100." });
      return z.NEVER;
    }
    return n;
  }),
});

export const clientSchema = z.object({
  name: text("Informe o nome."),
  document: optText,
  asaas_customer_id: optText,
  active: bool,
});

export const settingsSchema = z.object({
  simples_effective_rate: z.string().transform((s, ctx) => {
    const n = parsePercent(s);
    if (n === null) return null;
    if (Number.isNaN(n) || n < 0 || n > 33) {
      ctx.addIssue({ code: "custom", message: "A alíquota deve estar entre 0 e 33%." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 10000; // 6,5% -> 0.0650
  }),
});

/** Lê os campos de um FormData como strings (campos ausentes viram ""). */
export function formToObject(fd: FormData, names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, String(fd.get(n) ?? "")]));
}

const month = (msg: string) =>
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: msg }).transform((m) => `${m}-01`);
const optMonth = z
  .string()
  .transform((s, ctx) => {
    if (s === "") return null;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Mês final inválido." });
      return z.NEVER;
    }
    return `${s}-01`;
  });
const requiredDay = z.string().transform((s, ctx) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    ctx.addIssue({ code: "custom", message: "O dia deve estar entre 1 e 31." });
    return z.NEVER;
  }
  return n;
});

export const recurringRuleSchema = z
  .object({
    direction: z.enum(["in", "out"], { error: "Escolha entrada ou saída." }),
    description: text("Informe a descrição."),
    amount_cents: z.string().transform((s, ctx) => {
      const c = brlToCents(s);
      if (c == null || Number.isNaN(c) || c <= 0) {
        ctx.addIssue({ code: "custom", message: "Informe o valor (ex.: 55,90)." });
        return z.NEVER;
      }
      return c;
    }),
    day_of_month: requiredDay,
    start_month: month("Informe o mês de início."),
    end_month: optMonth,
    entity_id: z.uuid({ error: "Escolha a entidade." }),
    category_id: optUuid,
    payment_method_id: optUuid,
    client_id: optUuid,
    active: bool,
  })
  .refine((r) => !r.end_month || r.end_month >= r.start_month, { error: "O mês final não pode ser antes do início." });
