import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extract, norm, type Extracted } from "./extract";
import { layoutSchema, sanitizeLayout, type Layout } from "./layout";
import { buildPlan, fingerprint, parseInstallment, type PlanCtx, type PmInfo } from "./plan";
import { dumpGrids, readWorkbook } from "./read";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const E = { av: ID(1), casa: ID(2), ale: ID(3) };
const itau: PmInfo = { id: ID(10), name: "Cartão Itaú", kind: "credit_card", owner_entity_id: E.casa, holder_person_id: null, closing_day: 13, due_day: 20 };
const alex: PmInfo = { id: ID(11), name: "Cartão Alexandre", kind: "credit_card", owner_entity_id: E.ale, holder_person_id: ID(21), closing_day: 29, due_day: 6 };

async function workbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  // GASTOS MENSAIS: A=valor, B=descrição, C=vencimento (novembro nas linhas 2-8, dezembro nas 12-18)
  ws.getCell("A1").value = "GASTOS MENSAIS NOV/2026";
  [[850, "Condomínio", 10], [420, "Energia", 15], [3500, "ITAU", 20], [1800, "Colégio", 5], [6570, "TOTAL", null]].forEach(([v, d, dia], i) => {
    ws.getCell(`A${2 + i}`).value = v as number; ws.getCell(`B${2 + i}`).value = d as string; if (dia) ws.getCell(`C${2 + i}`).value = dia as number;
  });
  ws.getCell("A11").value = "GASTOS MENSAIS DEZ/2026";
  [[850, "Condomínio", 10], [455, "Energia", 15], [3800, "ITAU", 20]].forEach(([v, d, dia], i) => {
    ws.getCell(`A${12 + i}`).value = v as number; ws.getCell(`B${12 + i}`).value = d as string; ws.getCell(`C${12 + i}`).value = dia as number;
  });
  // Cartão Itaú por fatura: F/G (nov), I/J (dez), L/M (jan)
  const itauRows = (colV: string, colD: string, rows: [number | string, string][]) => rows.forEach(([v, d], i) => { ws.getCell(`${colV}${2 + i}`).value = v; ws.getCell(`${colD}${2 + i}`).value = d; });
  itauRows("F", "G", [[49.9, "CANVA"], [100, "CHATGPT"], [1200, "MACBOOK 11/12"], [25, "UBER"], ["R$ 1.374,90", "TOTAL"]]);
  itauRows("I", "J", [[49.9, "CANVA"], [100, "CHATGPT"], [1200, "MACBOOK 12/12"]]);
  itauRows("L", "M", [[49.9, "CANVA"], [100, "CHATGPT"]]);
  // Cartão Alexandre (nov): O/P
  ws.getCell("O2").value = 600; ws.getCell("P2").value = "PS5 1/10";
  // Recebimentos por dia (nov): R=dia, S=valor, T=cliente / (dez): V,W,X
  ws.getCell("R2").value = 5; ws.getCell("S2").value = 2500; ws.getCell("T2").value = "SR Tecnologia";
  ws.getCell("V2").value = "05/12"; ws.getCell("W2").value = 2500; ws.getCell("X2").value = "SR Tecnologia";
  ws.getCell("A20").value = { formula: "A2+A3", result: 1270 };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const layout = (): Layout => layoutSchema.parse({ regions: [
  { id: "g-nov", sheet: "Planilha", kind: "monthly_bills", month: "2026-11", firstRow: 2, lastRow: 8, valueCol: 1, descriptionCol: 2, dateCol: 3 },
  { id: "g-dez", sheet: "Planilha", kind: "monthly_bills", month: "2026-12", firstRow: 12, lastRow: 18, valueCol: 1, descriptionCol: 2, dateCol: 3 },
  { id: "i-nov", sheet: "Planilha", kind: "card_purchases", month: "2026-11", card: "ITAU", cardId: itau.id, firstRow: 2, lastRow: 6, valueCol: 6, descriptionCol: 7 },
  { id: "i-dez", sheet: "Planilha", kind: "card_purchases", month: "2026-12", card: "ITAU", cardId: itau.id, firstRow: 2, lastRow: 6, valueCol: 9, descriptionCol: 10 },
  { id: "i-jan", sheet: "Planilha", kind: "card_purchases", month: "2027-01", card: "ITAU", cardId: itau.id, firstRow: 2, lastRow: 6, valueCol: 12, descriptionCol: 13 },
  { id: "a-nov", sheet: "Planilha", kind: "card_purchases", month: "2026-11", card: "ALEXANDRE", cardId: alex.id, firstRow: 2, lastRow: 6, valueCol: 15, descriptionCol: 16 },
  { id: "r-nov", sheet: "Planilha", kind: "income", month: "2026-11", firstRow: 2, lastRow: 6, valueCol: 19, descriptionCol: 20, dateCol: 18 },
  { id: "r-dez", sheet: "Planilha", kind: "income", month: "2026-12", firstRow: 2, lastRow: 6, valueCol: 23, descriptionCol: 24, dateCol: 22 },
] });

const ctx = (o: Partial<PlanCtx> = {}): PlanCtx => {
  let n = 100;
  return {
    today: "2026-11-14", methods: [itau, alex],
    entities: [{ id: E.av, name: "Aventure", kind: "pj" }, { id: E.casa, name: "Casa", kind: "shared" }, { id: E.ale, name: "Alexandre", kind: "pf" }],
    clients: [{ id: ID(30), name: "SR Tecnologia" }],
    existingKeys: new Set(), existingFingerprints: new Set(), existingRules: [], newId: () => ID(n++), ...o,
  };
};

async function run(c = ctx()) {
  const grids = await readWorkbook(await workbook());
  const ex = extract(grids, layout());
  return { grids, ex, plan: buildPlan(ex.items, ex.ignored, c) };
}

describe("leitura da planilha", () => {
  it("lê o .xlsx: números, textos e fórmulas (vale o resultado)", async () => {
    const [g] = await readWorkbook(await workbook());
    expect(g.name).toBe("Planilha");
    expect(g.rows[1][0]).toBe(850);
    expect(g.rows[1][1]).toBe("Condomínio");
    expect(g.rows[19][0]).toBe(1270);
    expect(dumpGrids([g])).toContain('L2: A=850 | B="Condomínio" | C=10');
  });
});

describe("mapa do layout", () => {
  it("descarta bloco que aponta para aba inexistente", async () => {
    const grids = await readWorkbook(await workbook());
    const l = layoutSchema.parse({ regions: [{ id: "x", sheet: "Outra", kind: "income", month: "2026-11", firstRow: 1, lastRow: 3, valueCol: 1, descriptionCol: 2 }, ...layout().regions] });
    const r = sanitizeLayout(l, grids);
    expect(r.layout.regions).toHaveLength(8);
    expect(r.warnings[0]).toContain("Outra");
  });
  it("rejeita mapa inválido (mês fora do formato, linha final antes da inicial)", () => {
    expect(layoutSchema.safeParse({ regions: [{ id: "x", sheet: "A", kind: "income", month: "novembro", firstRow: 1, lastRow: 2, valueCol: 1, descriptionCol: 2 }] }).success).toBe(false);
    expect(layoutSchema.safeParse({ regions: [{ id: "x", sheet: "A", kind: "income", month: "2026-11", firstRow: 5, lastRow: 2, valueCol: 1, descriptionCol: 2 }] }).success).toBe(false);
  });
});

describe("extração", () => {
  it("ignora linhas de total e valores sem descrição, entende valor em texto e datas", async () => {
    const { ex } = await run();
    const desc = (e: Extracted) => e.items.map((i) => i.description);
    expect(desc(ex)).not.toContain("TOTAL");
    expect(ex.ignored.filter((i) => i.reason === "linha de total").length).toBeGreaterThanOrEqual(2);
    const dez = ex.items.find((i) => i.regionId === "r-dez")!;
    expect(dez).toMatchObject({ date: "2026-12-05", day: 5, amountCents: 250000 });
    expect(ex.items.find((i) => i.regionId === "g-nov" && i.description === "Condomínio")).toMatchObject({ day: 10, amountCents: 85000 });
  });
  it("normaliza texto sem acento", () => { expect(norm("  Condomínio  ")).toBe("condominio"); });
});

describe("parcelas n/N", () => {
  it("reconhece o padrão e separa o nome da compra", () => {
    expect(parseInstallment("MACBOOK 11/12")).toEqual({ base: "MACBOOK", n: 11, total: 12 });
    expect(parseInstallment("Geladeira (3/10)")).toEqual({ base: "Geladeira", n: 3, total: 10 });
    expect(parseInstallment("TV Samsung - 1/6 parcela")).toMatchObject({ n: 1, total: 6 });
  });
  it("não confunde com texto sem parcela ou número impossível", () => {
    expect(parseInstallment("UBER")).toBeNull();
    expect(parseInstallment("MESA 13/12")).toBeNull();
    expect(parseInstallment("ITEM 1/1")).toBeNull();
  });
});

describe("plano de importação", () => {
  it("MacBook 11/12 (nov) e 12/12 (dez) viram UM grupo de 12 parcelas, com a 1ª fatura calculada para trás", async () => {
    const { plan } = await run();
    const g = plan.groups.find((x) => x.description === "MACBOOK")!;
    expect(g).toMatchObject({ installments: 12, installment_cents: 120000, first_invoice_month: "2026-01-01", payment_method_id: itau.id });
    const rows = plan.txs.filter((t) => t.installment_group_id === g.id).sort((a, b) => a.installment_number! - b.installment_number!);
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.installment_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows[0]).toMatchObject({ invoice_month: "2026-01-01", cash_date: "2026-01-20", status: "paid" });
    expect(rows[10]).toMatchObject({ invoice_month: "2026-11-01", cash_date: "2026-11-20", status: "pending" }); // 11/12 = fatura de novembro
    expect(rows[11]).toMatchObject({ invoice_month: "2026-12-01", cash_date: "2026-12-20", status: "pending" });
    expect(plan.txs.filter((t) => t.description === "MACBOOK")).toHaveLength(12); // não duplica as parcelas que aparecem na planilha
  });
  it("PS5 1/10 no cartão do Alexandre (fecha 29, vence 6): 10 parcelas a partir da fatura de novembro", async () => {
    const { plan } = await run();
    const g = plan.groups.find((x) => x.description === "PS5")!;
    expect(g).toMatchObject({ installments: 10, first_invoice_month: "2026-11-01", payment_method_id: alex.id });
    const first = plan.txs.find((t) => t.installment_group_id === g.id && t.installment_number === 1)!;
    expect(first).toMatchObject({ invoice_month: "2026-11-01", cash_date: "2026-11-06", status: "paid", entity_id: E.ale, person_id: ID(21) });
    const last = plan.txs.find((t) => t.installment_group_id === g.id && t.installment_number === 10)!;
    expect(last).toMatchObject({ invoice_month: "2027-08-01", cash_date: "2027-08-06", status: "pending" });
  });
  it("assinatura repetida em 3 meses com o mesmo valor vira regra recorrente, e os meses importados usam a chave do cron", async () => {
    const { plan } = await run();
    const rule = plan.rules.find((r) => r.description === "CANVA")!;
    expect(rule).toMatchObject({ direction: "out", amount_cents: 4990, day_of_month: 1, start_month: "2026-11-01", payment_method_id: itau.id });
    const rows = plan.txs.filter((t) => t.recurring_rule_id === rule.id);
    expect(rows.map((r) => r.external_id)).toEqual([`${rule.id}:2026-11`, `${rule.id}:2026-12`, `${rule.id}:2027-01`]);
    expect(rows.every((r) => r.source === "recurring")).toBe(true);
    expect(plan.rules.map((r) => r.description)).toContain("CHATGPT");
  });
  it("contas fixas que se repetem viram regras (valor mais recente); a que só aparece uma vez fica avulsa", async () => {
    const { plan } = await run();
    expect(plan.rules.find((r) => r.description === "Energia")).toMatchObject({ amount_cents: 45500, day_of_month: 15, entity_id: E.casa, payment_method_id: null });
    expect(plan.rules.find((r) => r.description === "Condomínio")).toBeTruthy();
    expect(plan.rules.some((r) => r.description === "Colégio")).toBe(false);
    const colegio = plan.txs.find((t) => t.description === "Colégio")!;
    expect(colegio).toMatchObject({ source: "import_sheet", recurring_rule_id: null, cash_date: "2026-11-05", status: "paid" });
    const energia = plan.txs.filter((t) => t.description === "Energia");
    expect(energia.map((t) => t.amount_cents)).toEqual([42000, 45500]); // cada mês com o seu valor real
  });
  it("a fatura do cartão (linha ITAU) e os totais não entram como despesa", async () => {
    const { plan } = await run();
    expect(plan.txs.some((t) => norm(t.description) === "itau")).toBe(false);
    expect(plan.ignored.filter((i) => i.reason.startsWith("fatura do cartão")).length).toBe(2);
  });
  it("recebimento do cliente repetido vira regra de entrada ligada ao cliente", async () => {
    const { plan } = await run();
    expect(plan.rules.find((r) => r.description === "SR Tecnologia")).toMatchObject({ direction: "in", amount_cents: 250000, client_id: ID(30), entity_id: E.av });
    const t = plan.txs.filter((x) => x.description === "SR Tecnologia");
    expect(t.map((x) => x.cash_date)).toEqual(["2026-11-05", "2026-12-05"]);
    expect(t.every((x) => x.type === "income")).toBe(true);
  });
  it("itens avulsos entram para revisão, sem categoria", async () => {
    const { plan } = await run();
    const uber = plan.txs.find((t) => t.description === "UBER")!;
    expect(uber).toMatchObject({ source: "import_sheet", category_id: null, needs_review: true, invoice_month: "2026-11-01", cash_date: "2026-11-20", entity_id: E.casa });
    expect(plan.txs.every((t) => t.needs_review && t.category_id === null)).toBe(true);
  });
  it("importar de novo a mesma planilha não duplica nada", async () => {
    const first = await run();
    const again = await run(ctx({
      existingKeys: new Set(first.plan.txs.map((t) => t.external_id)),
      existingFingerprints: new Set(first.plan.txs.map(fingerprint)),
      existingRules: first.plan.rules.map((r) => ({ description: r.description, direction: r.direction, payment_method_id: r.payment_method_id })),
    }));
    expect(again.plan.txs).toHaveLength(0);
    expect(again.plan.groups).toHaveLength(0);
    expect(again.plan.rules).toHaveLength(0);
    expect(again.plan.stats.duplicate).toBe(first.plan.txs.length);
  });
  it("cartão do bloco sem identificação: itens ignorados com motivo", async () => {
    const grids = await readWorkbook(await workbook());
    const l = layout(); l.regions = l.regions.map((r) => (r.id === "i-nov" ? { ...r, cardId: null } : r));
    const ex = extract(grids, l);
    const plan = buildPlan(ex.items, ex.ignored, ctx());
    expect(plan.ignored.some((i) => i.reason === "cartão do bloco não identificado")).toBe(true);
  });
  it("estatísticas coerentes", async () => {
    const { plan } = await run();
    expect(plan.stats).toMatchObject({ groups: 2, installmentTxs: 22, created: plan.txs.length, duplicate: 0 });
    expect(plan.stats.rules).toBe(plan.rules.length);
  });
});
