import { describe, expect, it } from "vitest";
import { addMonths, cashDateFor, invoiceMonthFor, splitInstallments } from "./invoice";

describe("invoiceMonthFor", () => {
  it("Itaú (fecha 13, vence 20)", () => {
    expect(invoiceMonthFor("2026-11-10", 13, 20)).toBe("2026-11-01");
    expect(invoiceMonthFor("2026-11-12", 13, 20)).toBe("2026-11-01");
    expect(invoiceMonthFor("2026-11-14", 13, 20)).toBe("2026-12-01"); // exemplo da especificação
  });
  it("compra no dia do fechamento cai na fatura seguinte", () => {
    expect(invoiceMonthFor("2026-11-13", 13, 20)).toBe("2026-12-01");
  });
  it("Nubank Amanda (fecha 8, vence 15) e Nubank Ventura (fecha 10, vence 18)", () => {
    expect(invoiceMonthFor("2026-11-07", 8, 15)).toBe("2026-11-01");
    expect(invoiceMonthFor("2026-11-08", 8, 15)).toBe("2026-12-01");
    expect(invoiceMonthFor("2026-11-09", 10, 18)).toBe("2026-11-01");
  });
  it("cartão do Alexandre (fecha 29, vence 6): vence no mês seguinte ao fechamento", () => {
    expect(invoiceMonthFor("2026-11-10", 29, 6)).toBe("2026-12-01");
    expect(invoiceMonthFor("2026-11-28", 29, 6)).toBe("2026-12-01");
    expect(invoiceMonthFor("2026-11-29", 29, 6)).toBe("2027-01-01"); // no dia do fechamento
    expect(invoiceMonthFor("2026-12-30", 29, 6)).toBe("2027-02-01");
  });
  it("vira o ano", () => {
    expect(invoiceMonthFor("2026-12-20", 13, 20)).toBe("2027-01-01");
  });
  it("fechamento 31 em mês curto vale o último dia do mês", () => {
    expect(invoiceMonthFor("2026-02-27", 31, 10)).toBe("2026-03-01");
    expect(invoiceMonthFor("2026-02-28", 31, 10)).toBe("2026-04-01");
  });
});

describe("cashDateFor / addMonths / splitInstallments", () => {
  it("vencimento 31 vira o último dia do mês", () => {
    expect(cashDateFor("2027-02-01", 31)).toBe("2027-02-28");
    expect(cashDateFor("2028-02-01", 31)).toBe("2028-02-29");
    expect(cashDateFor("2026-12-01", 20)).toBe("2026-12-20");
  });
  it("soma meses mantendo o dia", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-14", 3)).toBe("2027-02-14");
    expect(addMonths("2026-11-14", 0)).toBe("2026-11-14");
  });
  it("divide em centavos inteiros, com o resto na primeira parcela", () => {
    expect(splitInstallments(4500, 3)).toEqual([1500, 1500, 1500]);
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((a, b) => a + b)).toBe(10000);
    expect(splitInstallments(5, 1)).toEqual([5]);
  });
});
