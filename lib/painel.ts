import { MESES_CURTOS } from "@/lib/cashflow";
import { dreMonth, type DreInput } from "@/lib/dre";
import { addInvoiceMonths } from "@/lib/invoice";

export type MonthMetrics = { month: string; label: string; receita: number; despesa: number; resultado: number; distribuicao: number };

/** Receita, despesa, resultado (lucro líquido) e retiradas de um mês: os mesmos números do DRE. */
export function monthMetrics(input: DreInput, month: string): MonthMetrics {
  const d = dreMonth(input, month);
  return {
    month, label: `${MESES_CURTOS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`,
    receita: d.receita, despesa: d.receita - d.lucroLiquido, resultado: d.lucroLiquido, distribuicao: d.distribuicao,
  };
}

/** 12 meses terminando em `month` (dia 1), do mais antigo ao mais novo; meses sem dados vêm zerados. */
export function series12(input: DreInput, month: string): MonthMetrics[] {
  return Array.from({ length: 12 }, (_, i) => monthMetrics(input, addInvoiceMonths(month, i - 11)));
}

export type Alert = { tone: "late" | "warn" | "plain"; text: string; href?: string };
