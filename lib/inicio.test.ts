import { describe, expect, it } from "vitest";
import { dailyTotals, effCents, monthTotals } from "./inicio";

const t = (type: "income" | "expense", amount: number, date: string, o: { paid?: number | null; status?: string } = {}) => ({
  type, amount_cents: amount, paid_amount_cents: o.paid ?? null, status: o.status ?? "pending", competence_date: date,
});
const txs = [
  t("expense", 25000, "2026-11-14"), // gasolina no cartão (pendente)
  t("expense", 4990, "2026-11-14"),
  t("expense", 10000, "2026-11-02", { status: "paid", paid: 10500 }), // pago com valor real diferente
  t("income", 250000, "2026-11-05", { status: "paid", paid: 250000 }),
  t("income", 30000, "2026-11-20"),
];

describe("início: todos os lançamentos do mês", () => {
  it("valor efetivo: o real pago manda, senão o previsto", () => {
    expect(effCents(t("expense", 10000, "2026-11-02", { status: "paid", paid: 10500 }))).toBe(10500);
    expect(effCents(t("expense", 10000, "2026-11-02"))).toBe(10000);
  });
  it("entradas, saídas e saldo, contando o que está no cartão (como a gasolina)", () => {
    expect(monthTotals(txs)).toEqual({ entradas: 280000, saidas: 25000 + 4990 + 10500, saldo: 280000 - 40490, count: 5 });
  });
  it("um ponto por dia do mês, com os dias vazios zerados", () => {
    const d = dailyTotals(txs, "2026-11-01");
    expect(d).toHaveLength(30);
    expect(d[13]).toMatchObject({ day: 14, label: "14", saida: 29990, entrada: 0 });
    expect(d[4]).toMatchObject({ day: 5, entrada: 250000, saida: 0 });
    expect(d[0]).toMatchObject({ saida: 0, entrada: 0 });
  });
  it("o número de dias respeita o mês (fevereiro bissexto) e ignora lançamentos de outro mês", () => {
    expect(dailyTotals([], "2028-02-01")).toHaveLength(29);
    expect(dailyTotals([t("expense", 100, "2026-12-01")], "2026-11-01").every((p) => p.saida === 0)).toBe(true);
  });
  it("mês sem lançamentos", () => {
    expect(monthTotals([])).toEqual({ entradas: 0, saidas: 0, saldo: 0, count: 0 });
  });
});
