import { describe, expect, it } from "vitest";
import { monthMetrics, series12, type DreRow } from "./painel";

const rows: DreRow[] = [
  { month: "2026-11-01", dre_line: "gross_revenue", amount_cents: 1000000 },
  { month: "2026-11-01", dre_line: "tax", amount_cents: 60000 },
  { month: "2026-11-01", dre_line: "cost_of_services", amount_cents: 300000 },
  { month: "2026-11-01", dre_line: "admin_expenses", amount_cents: 50000 },
  { month: "2026-11-01", dre_line: "distribution", amount_cents: 200000 },
  { month: "2026-10-01", dre_line: "gross_revenue", amount_cents: 800000 },
  { month: "2026-10-01", dre_line: "sales_expenses", amount_cents: 100000 },
];

describe("painel", () => {
  it("receita, despesa e resultado do mês; a distribuição fica fora do resultado", () => {
    expect(monthMetrics(rows, "2026-11-01")).toMatchObject({ receita: 1000000, despesa: 410000, resultado: 590000, distribuicao: 200000, label: "nov/26" });
  });
  it("mês sem dados vem zerado", () => {
    expect(monthMetrics(rows, "2026-09-01")).toMatchObject({ receita: 0, despesa: 0, resultado: 0 });
  });
  it("12 meses terminando no mês escolhido, em ordem", () => {
    const s = series12(rows, "2026-11-01");
    expect(s).toHaveLength(12);
    expect(s[0].month).toBe("2025-12-01");
    expect(s[11].month).toBe("2026-11-01");
    expect(s[10]).toMatchObject({ receita: 800000, despesa: 100000 });
  });
});
