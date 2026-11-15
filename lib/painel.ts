import { MESES_CURTOS } from "@/lib/cashflow";
import { addInvoiceMonths } from "@/lib/invoice";

export type DreRow = { month: string; dre_line: string; amount_cents: number };

const DESPESA = ["tax", "deductions", "cost_of_services", "admin_expenses", "sales_expenses", "structure_expenses", "pro_labore", "financial"];

export type MonthMetrics = { month: string; label: string; receita: number; despesa: number; resultado: number; distribuicao: number };

/** Receita, despesa, resultado e distribuição de um mês, a partir das linhas da view v_dre_monthly. */
export function monthMetrics(rows: DreRow[], month: string): MonthMetrics {
  let receita = 0, despesa = 0, distribuicao = 0;
  for (const r of rows) {
    if (r.month.slice(0, 7) !== month.slice(0, 7)) continue;
    if (r.dre_line === "gross_revenue") receita += r.amount_cents;
    else if (DESPESA.includes(r.dre_line)) despesa += r.amount_cents;
    else if (r.dre_line === "distribution") distribuicao += r.amount_cents;
  }
  return { month, label: `${MESES_CURTOS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`, receita, despesa, resultado: receita - despesa, distribuicao };
}

/** 12 meses terminando em `month` (dia 1), do mais antigo ao mais novo; meses sem dados vêm zerados. */
export function series12(rows: DreRow[], month: string): MonthMetrics[] {
  return Array.from({ length: 12 }, (_, i) => monthMetrics(rows, addInvoiceMonths(month, i - 11)));
}

export type Alert = { tone: "late" | "warn" | "plain"; text: string; href?: string };
