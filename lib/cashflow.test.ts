import { describe, expect, it } from "vitest";
import { balanceAt, byMonth, byWeek, projectDays, virtualRecurring, weekStart } from "./cashflow";
import type { MethodInfo } from "./launch";
import type { RuleRow } from "./recurrence";

describe("projectDays", () => {
  it("saldo corrido dia a dia a partir do saldo base, com dias vazios incluídos", () => {
    const d = projectDays({
      base: 100000, from: "2026-11-01", to: "2026-11-05",
      flows: [{ date: "2026-11-02", inflow: 50000, outflow: 0 }, { date: "2026-11-02", inflow: 0, outflow: 20000 }, { date: "2026-11-04", inflow: 0, outflow: 150000 }],
    });
    expect(d.map((x) => x.balance)).toEqual([100000, 130000, 130000, -20000, -20000]);
    expect(d[1]).toMatchObject({ inflow: 50000, outflow: 20000, net: 30000 });
    expect(d).toHaveLength(5);
  });
  it("atravessa virada de mês e ano bissexto", () => {
    const d = projectDays({ base: 0, flows: [], from: "2028-02-27", to: "2028-03-01" });
    expect(d.map((x) => x.date)).toEqual(["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01"]);
  });
});

describe("balanceAt", () => {
  it("com saldo informado: saldo + movimento desde a data dele", () => {
    expect(balanceAt({ cents: 500000, date: "2026-11-10" }, 120000, 100000)).toBe(520000);
    expect(balanceAt({ cents: 500000, date: "2026-11-10" }, 80000, 100000)).toBe(480000); // antes da data: volta no tempo
  });
  it("sem saldo informado: só o acumulado", () => {
    expect(balanceAt({ cents: 0, date: null }, 120000, 0)).toBe(120000);
  });
});

describe("resumos", () => {
  const days = projectDays({
    base: 100000, from: "2026-11-25", to: "2026-12-10",
    flows: [{ date: "2026-11-28", inflow: 0, outflow: 150000 }, { date: "2026-12-05", inflow: 300000, outflow: 0 }],
  });
  it("por mês: entrada, saída, saldo final e mês negativo em destaque", () => {
    const [nov, dez] = byMonth(days);
    expect(nov).toMatchObject({ key: "2026-11", label: "nov/26", outflow: 150000, endBalance: -50000, minBalance: -50000, negative: true });
    expect(dez).toMatchObject({ key: "2026-12", inflow: 300000, endBalance: 250000, minBalance: -50000, negative: true });
  });
  it("por semana, começando na segunda-feira", () => {
    expect(weekStart("2026-11-14")).toBe("2026-11-09"); // sábado
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // segunda
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(byWeek(days)[0].key).toBe("2026-11-23");
  });
});

describe("virtualRecurring", () => {
  const rule: RuleRow = {
    id: "r1", org_id: "o", direction: "out", description: "Condomínio", amount_cents: 85000, day_of_month: 10, start_month: "2026-09-01",
    end_month: null, entity_id: "e", category_id: "c", payment_method_id: null, client_id: null, active: true,
  };
  const itau: MethodInfo = { id: "m1", kind: "credit_card", closing_day: 13, due_day: 20 };
  it("projeta os meses sem previsto e pula os que já foram gerados", () => {
    const r = virtualRecurring({ rules: [rule], methods: new Map(), existingKeys: new Set(["r1:2026-11"]), fromMonth: "2026-11-01", toMonth: "2027-02-01" });
    expect(r.map((x) => x.date)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(r[0]).toMatchObject({ outflow: 85000, inflow: 0 });
  });
  it("entrada de cliente e assinatura no cartão (data de caixa = vencimento da fatura)", () => {
    const entrada: RuleRow = { ...rule, id: "r2", direction: "in", amount_cents: 250000, day_of_month: 5 };
    const assin: RuleRow = { ...rule, id: "r3", payment_method_id: "m1", amount_cents: 10000, day_of_month: 20 };
    const r = virtualRecurring({ rules: [entrada, assin], methods: new Map([["m1", itau]]), existingKeys: new Set(), fromMonth: "2026-11-01", toMonth: "2026-11-01" });
    expect(r).toContainEqual({ date: "2026-11-05", inflow: 250000, outflow: 0 });
    expect(r).toContainEqual({ date: "2026-12-20", inflow: 0, outflow: 10000 });
  });
  it("respeita o fim da regra", () => {
    const r = virtualRecurring({ rules: [{ ...rule, end_month: "2026-12-01" }], methods: new Map(), existingKeys: new Set(), fromMonth: "2026-11-01", toMonth: "2027-03-01" });
    expect(r).toHaveLength(2);
  });
});
