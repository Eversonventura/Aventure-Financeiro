import { describe, expect, it } from "vitest";
import { dreMonth, dreTable, DRE_ROWS, type DreInput, type DreRowS } from "./dre";

const r = (month: string, dre_line: string, income_cents: number, expense_cents: number): DreRowS => ({ month, dre_line, income_cents, expense_cents });

// Novembro/2026: receita 10.000, DAS pago 600, custo 3.000, admin 500, comercial 200, estrutura 150, pró-labore 1.000,
// tarifas 80 e rendimentos 30, retiradas 1.200 + distribuição 500
const nov = (): DreInput => ({
  rate: 0.06,
  withdrawals: { "2026-11": 120000 },
  rows: [
    r("2026-11-01", "gross_revenue", 1000000, 0), r("2026-11-01", "tax", 0, 60000), r("2026-11-01", "cost_of_services", 0, 300000),
    r("2026-11-01", "admin_expenses", 0, 50000), r("2026-11-01", "sales_expenses", 0, 20000), r("2026-11-01", "structure_expenses", 0, 15000),
    r("2026-11-01", "pro_labore", 0, 100000), r("2026-11-01", "financial", 3000, 8000), r("2026-11-01", "distribution", 0, 50000),
  ],
});

describe("DRE do mês (estrutura da especificação)", () => {
  it("calcula cada linha e subtotal, na ordem", () => {
    const m = dreMonth(nov(), "2026-11-01");
    expect(m).toMatchObject({
      receita: 1000000, das: 60000, dasKind: "pago", cancelamentos: 0, receitaLiquida: 940000, custo: 300000, margem: 640000,
      administrativas: 50000, comerciais: 20000, estrutura: 15000, prolabore: 100000, resultadoOperacional: 455000,
      financeiro: -5000, lucroLiquido: 450000, distribuicao: 170000, caixaRetido: 280000,
    });
  });
  it("as linhas da tabela seguem a ordem do documento", () => {
    expect(DRE_ROWS.map((x) => x.key)).toEqual(["receita", "das", "cancelamentos", "receitaLiquida", "custo", "margem", "administrativas", "comerciais", "estrutura", "prolabore", "resultadoOperacional", "financeiro", "lucroLiquido", "distribuicao", "caixaRetido"]);
  });
  it("sem DAS pago, usa a alíquota efetiva × receita (previsto) e acusa a diferença para o pago", () => {
    const i = nov(); i.rows = i.rows.filter((x) => x.dre_line !== "tax");
    const m = dreMonth(i, "2026-11-01");
    expect(m).toMatchObject({ das: 60000, dasKind: "previsto", dasPago: 0, dasPrevisto: 60000 });
    const pago = dreMonth({ ...nov(), rate: 0.07 }, "2026-11-01");
    expect(pago).toMatchObject({ das: 60000, dasKind: "pago", dasPrevisto: 70000 }); // pago manda; previsto fica para conferência
  });
  it("sem alíquota cadastrada e sem DAS pago, a linha fica zerada e avisa", () => {
    const i = nov(); i.rows = i.rows.filter((x) => x.dre_line !== "tax"); i.rate = null;
    expect(dreMonth(i, "2026-11-01")).toMatchObject({ das: 0, dasKind: "sem_aliquota", dasPrevisto: null });
  });
  it("resultado financeiro tem sinal: rendimentos somam, tarifas e juros subtraem", () => {
    const i: DreInput = { rate: null, withdrawals: {}, rows: [r("2026-11-01", "financial", 20000, 5000)] };
    expect(dreMonth(i, "2026-11-01").financeiro).toBe(15000);
  });
  it("estorno abate o custo, e o mês sem nada vem zerado", () => {
    const i: DreInput = { rate: null, withdrawals: {}, rows: [r("2026-11-01", "cost_of_services", 10000, 70000)] };
    expect(dreMonth(i, "2026-11-01").custo).toBe(60000);
    const vazio = dreMonth(i, "2026-09-01");
    expect(vazio).toMatchObject({ receita: 0, lucroLiquido: 0, caixaRetido: 0 });
  });
  it("retiradas somam os gastos pessoais pagos pela empresa e a distribuição de lucros", () => {
    expect(dreMonth(nov(), "2026-11-01").distribuicao).toBe(120000 + 50000);
  });
  it("lucro negativo e caixa retido negativo quando se retira mais do que se lucra", () => {
    const i: DreInput = { rate: null, withdrawals: { "2026-11": 500000 }, rows: [r("2026-11-01", "gross_revenue", 600000, 0), r("2026-11-01", "cost_of_services", 0, 100000)] };
    const m = dreMonth(i, "2026-11-01");
    expect(m).toMatchObject({ lucroLiquido: 500000, caixaRetido: 0 });
    i.withdrawals["2026-11"] = 800000;
    expect(dreMonth(i, "2026-11-01").caixaRetido).toBe(-300000);
  });
});

describe("comparação com o mês anterior e a média de 3 meses", () => {
  const input = (): DreInput => ({
    rate: 0.06, withdrawals: {},
    rows: [
      r("2026-08-01", "gross_revenue", 600000, 0), r("2026-09-01", "gross_revenue", 900000, 0), r("2026-10-01", "gross_revenue", 800000, 0),
      r("2026-11-01", "gross_revenue", 1000000, 0), r("2026-10-01", "cost_of_services", 0, 200000), r("2026-11-01", "cost_of_services", 0, 300000),
    ],
  });
  it("traz mês anterior, média dos 3 anteriores, variação e % da receita", () => {
    const t = dreTable(input(), "2026-11-01");
    const receita = t.rows.find((x) => x.key === "receita")!;
    expect(receita).toMatchObject({ value: 1000000, prev: 800000, avg3: 766667, vsPrev: 25, pct: 100 });
    const custo = t.rows.find((x) => x.key === "custo")!;
    expect(custo).toMatchObject({ value: 300000, prev: 200000, avg3: 66667, vsPrev: 50, pct: 30 });
  });
  it("variação indefinida quando o mês anterior é zero, % indefinido sem receita", () => {
    const t = dreTable(input(), "2026-08-01");
    expect(t.rows.find((x) => x.key === "custo")!.vsPrev).toBeNull();
    const sem = dreTable({ rate: null, withdrawals: {}, rows: [] }, "2026-11-01");
    expect(sem.rows[0].pct).toBeNull();
  });
});
