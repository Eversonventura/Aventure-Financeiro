import { describe, expect, it } from "vitest";
import type { DreInput } from "./dre";
import { monthMetrics, series12 } from "./painel";

const row = (month: string, dre_line: string, income_cents: number, expense_cents: number) => ({ month, dre_line, income_cents, expense_cents });
const input: DreInput = {
  rate: null, withdrawals: { "2026-11": 150000 },
  rows: [
    row("2026-11-01", "gross_revenue", 1000000, 0), row("2026-11-01", "tax", 0, 60000), row("2026-11-01", "cost_of_services", 0, 300000),
    row("2026-11-01", "admin_expenses", 0, 50000), row("2026-11-01", "distribution", 0, 50000),
    row("2026-10-01", "gross_revenue", 800000, 0), row("2026-10-01", "sales_expenses", 0, 100000),
  ],
};

describe("painel (mesmos números do DRE)", () => {
  it("receita, despesa e resultado do mês; retiradas somam gastos pessoais e distribuição", () => {
    expect(monthMetrics(input, "2026-11-01")).toMatchObject({ receita: 1000000, despesa: 410000, resultado: 590000, distribuicao: 200000, label: "nov/26" });
  });
  it("mês sem dados vem zerado", () => {
    expect(monthMetrics(input, "2026-09-01")).toMatchObject({ receita: 0, despesa: 0, resultado: 0 });
  });
  it("12 meses terminando no mês escolhido, em ordem", () => {
    const s = series12(input, "2026-11-01");
    expect(s).toHaveLength(12);
    expect(s[0].month).toBe("2025-12-01");
    expect(s[11].month).toBe("2026-11-01");
    expect(s[10]).toMatchObject({ receita: 800000, despesa: 100000 });
  });
});
