import { describe, expect, it } from "vitest";
import type { DreInput } from "@/lib/dre";
import { buildAggregates, eff, findDuplicateSubscriptions, spendByCategory, spendByKey, spendByNature, type CatInfo, type Extras, type TxRow } from "./calc";

const cats: CatInfo = new Map([
  ["mercado", { name: "Mercado", nature: "essential" }], ["delivery", { name: "Delivery e restaurantes", nature: "superfluous" }],
  ["ferr", { name: "Ferramentas de produção", nature: "important" }], ["outros", { name: "Outros", nature: null }],
]);
const ents = new Map([["av", "Aventure"], ["casa", "Casa"], ["ve", "Ventura"]]);
const people = new Map([["p1", "Ventura"], ["p2", "Amanda"]]);
const tx = (cat: string | null, cents: number, date: string, o: Partial<TxRow> = {}): TxRow => ({
  type: "expense", status: "pending", amount_cents: cents, paid_amount_cents: null, competence_date: date, description: "x", entity_id: "casa", person_id: "p1", category_id: cat, payment_method_id: null, ...o,
});
const rows: TxRow[] = [
  tx("delivery", 30000, "2026-10-05"), tx("delivery", 20000, "2026-10-20"), tx("mercado", 80000, "2026-10-10", { person_id: "p2" }),
  tx("delivery", 10000, "2026-09-05"), tx("delivery", 10000, "2026-08-05"), tx("delivery", 10000, "2026-07-05"), // média 10.000
  tx("mercado", 70000, "2026-09-10"), tx("ferr", 15000, "2026-10-12", { entity_id: "av", person_id: null }),
  tx(null, 5000, "2026-10-14"), tx("outros", 1000, "2026-10-15", { type: "income" }), tx("mercado", 999999, "2026-10-16", { type: "transfer" }),
];

describe("gasto por categoria", () => {
  it("total do mês, itens e variação contra a média dos 3 meses anteriores; só saídas", () => {
    const r = spendByCategory(rows, cats, "2026-10-01");
    expect(r[0]).toMatchObject({ categoria: "Mercado", total_cents: 80000, itens: 1 });
    const d = r.find((x) => x.categoria === "Delivery e restaurantes")!;
    expect(d).toMatchObject({ total_cents: 50000, itens: 2, media_3_meses_cents: 10000, variacao_pct: 400 });
    expect(r.some((x) => x.categoria === "Sem categoria" && x.total_cents === 5000)).toBe(true);
    expect(r.reduce((s, x) => s + x.total_cents, 0)).toBe(80000 + 50000 + 15000 + 5000); // sem entrada nem transferência
  });
  it("sem média anterior a variação fica indefinida; limite e filtros funcionam", () => {
    expect(spendByCategory(rows, cats, "2026-10-01").find((x) => x.categoria === "Ferramentas de produção")!.variacao_pct).toBeNull();
    expect(spendByCategory(rows, cats, "2026-10-01", { limit: 2 })).toHaveLength(2);
    expect(spendByCategory(rows, cats, "2026-10-01", { entityId: "av" }).map((x) => x.categoria)).toEqual(["Ferramentas de produção"]);
    expect(spendByCategory(rows, cats, "2026-10-01", { personId: "p2" }).map((x) => x.total_cents)).toEqual([80000]);
  });
  it("valor real pago vale mais que o previsto", () => {
    expect(eff(tx("mercado", 1000, "2026-10-01", { status: "paid", paid_amount_cents: 1200 }))).toBe(1200);
  });
});

describe("por entidade, pessoa e natureza", () => {
  it("entidade e pessoa (com 'Sem pessoa')", () => {
    expect(spendByKey(rows, "2026-10-01", "entity_id", ents)).toEqual([{ nome: "Casa", total_cents: 135000 }, { nome: "Aventure", total_cents: 15000 }]);
    expect(spendByKey(rows, "2026-10-01", "person_id", people).map((x) => x.nome)).toEqual(["Amanda", "Ventura", "Sem pessoa"]);
  });
  it("natureza para o analista: essencial, importante, supérfluo e sem natureza", () => {
    expect(spendByNature(rows, cats, "2026-10-01")).toEqual({ essencial: 80000, importante: 15000, superfluo: 50000, sem_natureza: 5000 });
  });
});

describe("assinaturas repetidas", () => {
  it("a mesma assinatura cadastrada duas vezes (cartões diferentes) vira candidata a vazamento", () => {
    const r = findDuplicateSubscriptions([
      { description: "ChatGPT", amount_cents: 10000, entity_id: "av", payment_method_id: "itau" },
      { description: "chatgpt", amount_cents: 10000, entity_id: "ve", payment_method_id: "nub" },
      { description: "Canva", amount_cents: 4990, entity_id: "av", payment_method_id: "itau" },
    ], ents, new Map([["itau", "Cartão Itaú"], ["nub", "Nubank Ventura"]]));
    expect(r).toEqual([{ item: "ChatGPT", ocorrencias: 2, valor_mensal_cents: 20000, onde: ["Aventure · Cartão Itaú", "Ventura · Nubank Ventura"] }]);
  });
});

describe("agregados enviados ao analista", () => {
  const dreInput: DreInput = { rate: 0.06, withdrawals: { "2026-10": 120000 }, rows: [
    { month: "2026-10-01", dre_line: "gross_revenue", income_cents: 1000000, expense_cents: 0 },
    { month: "2026-10-01", dre_line: "cost_of_services", income_cents: 0, expense_cents: 300000 },
    { month: "2026-09-01", dre_line: "gross_revenue", income_cents: 800000, expense_cents: 0 },
  ] };
  const extras: Extras = { meses_negativos: [{ mes: "2026-12", saldo_minimo_cents: -50000 }], clientes_atrasados: [{ nome: "Siqueira", dias: 9, valor_cents: 180000 }], maior_cliente: { nome: "SR Tecnologia", pct: 40 }, gastos_da_aventure_fora_do_pj_cents: 24000, lancamentos_para_revisar: 3, parcelas_de_emprestimos_e_consorcios_por_mes_cents: 85000 };
  const a = buildAggregates({ month: "2026-10-01", dreInput, rows, cats, entities: ents, people, methods: new Map(), rules: [{ description: "Canva", amount_cents: 4990, entity_id: "av", payment_method_id: null }], extras });

  it("traz o DRE do mês, o anterior e a média, com margens em %", () => {
    expect(a.mes).toBe("2026-10");
    expect(a.dre.mes).toMatchObject({ receita: 1000000, custo: 300000, distribuicao: 120000 });
    expect(a.dre.margem_contribuicao_pct).toBeGreaterThan(0);
    expect(a.dre.mes_anterior.receita).toBe(800000);
  });
  it("traz só números agregados: nenhuma descrição de lançamento aparece", () => {
    const secretos = [tx("mercado", 5000, "2026-10-03", { description: "COMPRA-SIGILOSA-NO-MERCADO" }), tx("delivery", 7000, "2026-10-04", { description: "PEDIDO-PRIVADO-DE-JANTAR" })];
    const b = buildAggregates({ month: "2026-10-01", dreInput, rows: secretos, cats, entities: ents, people, methods: new Map(), rules: [], extras });
    const json = JSON.stringify(b);
    expect(json).not.toContain("SIGILOSA");
    expect(json).not.toContain("PRIVADO");
    expect(json).toContain("Mercado"); // a categoria aparece, o lançamento não
    expect(Object.keys(a)).toEqual(expect.arrayContaining(["dre", "gasto_por_categoria", "assinaturas_ativas", "alertas"]));
    expect(a.alertas.clientes_atrasados[0]).toMatchObject({ nome: "Siqueira", dias: 9 });
  });
  it("assinaturas ativas e total mensal", () => {
    expect(a.assinaturas_ativas).toEqual([{ descricao: "Canva", valor_mensal_cents: 4990, entidade: "Aventure", meio: null }]);
    expect(a.total_assinaturas_mensal_cents).toBe(4990);
  });
});
