import { describe, expect, it, vi } from "vitest";
import { buildPrompt, makeAi, parseAnswer, type Refs } from "./ai";
import { applyClassification, classifyBatch, findRule, historyMatch, ruleTextFrom, THRESHOLD, type Item, type Rule } from "./engine";
import { groupForReview, pendingMatching, type PendingTx } from "./review";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const E = { av: ID(1), ve: ID(2), casa: ID(3) };
const C = { mercado: ID(10), ferramentas: ID(11), delivery: ID(12), receita: ID(13) };
const itau = ID(20), nub = ID(21);

const rule = (o: Partial<Rule>): Rule => ({ id: ID(100), match_text: "guara", match_kind: "contains", payment_method_id: null, entity_id: E.casa, category_id: C.mercado, person_id: null, hits: 0, ...o });
const item = (description: string, o: Partial<Item> = {}): Item => ({ description, amount_cents: 4990, payment_method_id: itau, person_id: null, type: "expense", ...o });

const refs: Refs = {
  entities: [{ id: E.av, name: "Aventure", kind: "pj" }, { id: E.ve, name: "Ventura", kind: "pf" }, { id: E.casa, name: "Casa", kind: "shared" }],
  people: [{ id: ID(30), name: "Ventura" }],
  categories: [
    { id: C.ferramentas, name: "Ferramentas de produção", applies_to: "pj", direction: "out" },
    { id: C.mercado, name: "Mercado", applies_to: "pf", direction: "out" },
    { id: C.receita, name: "Mensalidade de cliente", applies_to: "pj", direction: "in" },
  ],
  methods: [{ id: itau, name: "Cartão Itaú" }], examples: [{ description: "CANVA", entity: "Aventure", category: "Ferramentas de produção" }],
};

describe("regras exatas", () => {
  it("normaliza acento e caixa, e respeita o meio quando a regra tem um", () => {
    expect(findRule([rule({})], "GUARÁ SUPERMERCADO 12", itau)?.id).toBe(ID(100));
    expect(findRule([rule({ payment_method_id: nub })], "Guará", itau)).toBeNull();
    expect(findRule([rule({ payment_method_id: nub })], "Guará", nub)).not.toBeNull();
    expect(findRule([rule({ match_kind: "equals" })], "Guará Supermercado", itau)).toBeNull();
    expect(findRule([rule({ match_kind: "equals" })], "guara", itau)).not.toBeNull();
  });
  it("desempate: exata > contém, regra do meio > geral, texto mais longo", () => {
    const geral = rule({ id: ID(1), match_text: "guara", entity_id: E.casa });
    const longa = rule({ id: ID(2), match_text: "guara express", entity_id: E.ve });
    const doMeio = rule({ id: ID(3), match_text: "guara", payment_method_id: itau, entity_id: E.av });
    const exata = rule({ id: ID(4), match_text: "guara express", match_kind: "equals", entity_id: E.av });
    expect(findRule([geral, longa], "Guara Express", itau)?.id).toBe(ID(2));
    expect(findRule([geral, doMeio], "Guara", itau)?.id).toBe(ID(3));
    expect(findRule([geral, longa, doMeio, exata], "Guara Express", itau)?.id).toBe(ID(4));
  });
  it("texto da regra sem o n/N das parcelas", () => {
    expect(ruleTextFrom("MACBOOK 11/12")).toBe("macbook");
    expect(ruleTextFrom("Guará  Supermercado")).toBe("guara supermercado");
  });
});

describe("histórico", () => {
  const h = (description: string, entity = E.av, category = C.ferramentas) => ({ description, entity_id: entity, category_id: category, person_id: null });
  it("3 confirmações iguais viram regra automática; 2 não", () => {
    expect(historyMatch([h("CANVA"), h("Canva"), h("canva")], "CANVA")).toMatchObject({ entity_id: E.av, category_id: C.ferramentas });
    expect(historyMatch([h("CANVA"), h("canva")], "CANVA")).toBeNull();
  });
  it("não vira regra se as confirmações divergem ou não têm categoria", () => {
    expect(historyMatch([h("CANVA"), h("canva"), h("canva", E.casa)], "canva")).toBeNull();
    expect(historyMatch([h("CANVA"), h("canva"), { ...h("canva"), category_id: null }], "canva")).toBeNull();
  });
});

describe("ordem de decisão", () => {
  const ai = vi.fn();
  it("regra primeiro (confiança 1), depois histórico, e a IA só para o que sobrou", async () => {
    ai.mockReset().mockResolvedValue([{ entity_id: E.ve, category_id: null, person_id: null, confidence: 0.55, question: "É seu?" }]);
    const history = ["a", "b", "c"].map(() => ({ description: "CANVA", entity_id: E.av, category_id: C.ferramentas, person_id: null }));
    const r = await classifyBatch([item("Guará"), item("CANVA"), item("UBER TRIP")], { rules: [rule({})], history, ai });
    expect(r[0]).toMatchObject({ source: "rule", confidence: 1, entity_id: E.casa, category_id: C.mercado, ruleId: ID(100) });
    expect(r[1]).toMatchObject({ source: "history", confidence: 1, autoRule: { match_text: "canva" } });
    expect(r[2]).toMatchObject({ source: "ai", confidence: 0.55 });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(ai.mock.calls[0][0]).toHaveLength(1); // só o UBER foi para a IA
  });
  it("sem IA configurada, o que não tem regra fica sem sugestão", async () => {
    const r = await classifyBatch([item("UBER")], { rules: [], history: [] });
    expect(r[0].source).toBe("none");
  });
  it("o mesmo texto no mesmo meio é perguntado à IA uma vez só", async () => {
    const resp = { entity_id: E.casa, category_id: C.mercado, person_id: null, confidence: 0.9, question: null };
    const ai2 = vi.fn().mockResolvedValue([resp, resp]);
    const r = await classifyBatch([item("PAO DE ACUCAR"), item("pao de acucar"), item("PAO DE ACUCAR", { payment_method_id: nub })], { rules: [], history: [], ai: ai2 });
    expect(ai2.mock.calls[0][0]).toHaveLength(2); // itaú (2 iguais) + nubank
    expect(r.every((x) => x.source === "ai")).toBe(true);
  });
});

describe("limite de confiança de 0,80", () => {
  const row = { person_id: null };
  it(">= 0,80 entra direto com entidade e categoria", () => {
    const c = applyClassification(row, { entity_id: E.casa, category_id: C.mercado, person_id: null, confidence: THRESHOLD, source: "ai" });
    expect(c).toMatchObject({ entity_id: E.casa, category_id: C.mercado, needs_review: false, ai_confidence: 0.8, ai_suggestion: null });
  });
  it("< 0,80 vai para a fila sem mexer na entidade nem na categoria, guardando a sugestão", () => {
    const c = applyClassification(row, { entity_id: E.casa, category_id: C.mercado, person_id: null, confidence: 0.79, source: "ai", question: "Mercado da Casa?" });
    expect(c.needs_review).toBe(true);
    expect(c.category_id).toBeNull();
    expect(c).not.toHaveProperty("entity_id");
    expect(c.ai_suggestion).toMatchObject({ entity_id: E.casa, category_id: C.mercado, question: "Mercado da Casa?" });
  });
  it("sem nenhuma sugestão, vai para a fila", () => {
    expect(applyClassification(row, { entity_id: null, category_id: null, person_id: null, confidence: 0, source: "none" })).toMatchObject({ needs_review: true, ai_suggestion: null });
  });
  it("não troca a pessoa que já foi informada", () => {
    expect(applyClassification({ person_id: ID(31) }, { entity_id: E.casa, category_id: C.mercado, person_id: ID(30), confidence: 1, source: "rule" }).person_id).toBe(ID(31));
  });
});

describe("critério de aceite: responder 'Guará é Casa' uma vez faz o próximo Guará entrar sem pergunta", () => {
  it("antes da regra vai para a fila; depois de criada, entra direto", async () => {
    const semRegra = await classifyBatch([item("GUARA SUPERMERCADO")], { rules: [], history: [] });
    expect(applyClassification({ person_id: null }, semRegra[0]).needs_review).toBe(true);
    // a pessoa responde "Casa" e marca "lembrar": a regra nasce do texto da descrição
    const nova = rule({ match_text: ruleTextFrom("GUARA SUPERMERCADO 12/12"), entity_id: E.casa, category_id: C.mercado });
    const depois = await classifyBatch([item("Guará Supermercado")], { rules: [nova], history: [] });
    expect(applyClassification({ person_id: null }, depois[0])).toMatchObject({ entity_id: E.casa, category_id: C.mercado, needs_review: false });
  });
});

describe("IA: prompt e validação da resposta", () => {
  it("o prompt traz entidades, categorias, exemplos e os lançamentos com códigos curtos", () => {
    const { user, codes } = buildPrompt(refs, [item("CANVA")]);
    expect(user).toContain("e1=Aventure (empresa (PJ))");
    expect(user).toContain("c1=Ferramentas de produção; empresa (PJ); saída");
    expect(user).toContain('"CANVA" → Aventure / Ferramentas de produção');
    expect(user).toContain('"method":"Cartão Itaú"');
    expect(codes.e.get("e1")).toBe(E.av);
  });
  it("converte os códigos de volta para ids e limita a confiança entre 0 e 1", () => {
    const { codes } = buildPrompt(refs, [item("CANVA"), item("X")]);
    const r = parseAnswer('```json\n{"items":[{"i":0,"entity":"e1","category":"c1","person":"p1","confidence":1.7,"question":null},{"i":1,"entity":"e9","category":"c9","confidence":0.5}]}\n```', codes, refs, 2);
    expect(r[0]).toMatchObject({ entity_id: E.av, category_id: C.ferramentas, person_id: ID(30), confidence: 1 });
    expect(r[1]).toBeNull(); // códigos inventados são descartados
  });
  it("descarta categoria que não vale para a entidade escolhida", () => {
    const { codes } = buildPrompt(refs, [item("MERCADO")]);
    const r = parseAnswer('{"items":[{"i":0,"entity":"e1","category":"c2","confidence":0.9}]}', codes, refs, 1); // Mercado (PF) para Aventure (PJ)
    expect(r[0]).toMatchObject({ entity_id: E.av, category_id: null });
  });
  it("falha de um lote não derruba a classificação: devolve vazio", async () => {
    const complete = vi.fn().mockResolvedValue("não consegui");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await makeAi(refs, complete)([item("X")])).toEqual([null]);
    err.mockRestore();
  });
  it("manda no máximo 40 lançamentos por chamada", async () => {
    const complete = vi.fn().mockResolvedValue('{"items":[]}');
    await makeAi(refs, complete)(Array.from({ length: 95 }, (_, i) => item(`ITEM ${i}`)));
    expect(complete).toHaveBeenCalledTimes(3);
  });
});

describe("fila de revisão", () => {
  const tx = (id: number, description: string, o: Partial<PendingTx> = {}): PendingTx => ({
    id: ID(500 + id), description, amount_cents: 1000 * id, type: "expense", competence_date: `2026-11-${String(id).padStart(2, "0")}`,
    payment_method_id: itau, entity_id: E.casa, ai_confidence: null, ai_suggestion: null, ...o,
  });
  it("agrupa o mesmo texto (sem n/N, sem acento) e põe o maior grupo primeiro", () => {
    const g = groupForReview([tx(1, "GUARÁ"), tx(2, "Guara"), tx(3, "UBER"), tx(4, "guara 1/3")]);
    expect(g[0]).toMatchObject({ ruleText: "guara", count: 3, totalCents: 7000 });
    expect(g[0].ids).toHaveLength(3);
    expect(g[1].ruleText).toBe("uber");
  });
  it("entrada e saída com o mesmo texto não se misturam", () => {
    expect(groupForReview([tx(1, "PIX CLIENTE"), tx(2, "PIX CLIENTE", { type: "income" })])).toHaveLength(2);
  });
  it("uma regra 'contém X' resolve de uma vez todos os pendentes parecidos", () => {
    const pend = [tx(1, "GUARÁ SUPERMERCADO"), tx(2, "Guara Express"), tx(3, "UBER")];
    expect(pendingMatching(pend, "guara")).toEqual([pend[0].id, pend[1].id]);
    expect(pendingMatching(pend, "")).toEqual([]);
  });
});

import { classifyPlan, MAX_AI_ITEMS } from "./plan";
import type { Plan, TxOut } from "../sheet/plan";

describe("classificação do plano de importação", () => {
  const tx = (description: string, o: Partial<TxOut> = {}): TxOut => ({
    type: "expense", status: "pending", description, amount_cents: 1000, paid_amount_cents: null, competence_date: "2026-11-01", cash_date: "2026-11-20",
    invoice_month: "2026-11-01", entity_id: E.casa, person_id: null, payment_method_id: itau, category_id: null, client_id: null,
    installment_group_id: null, installment_number: null, recurring_rule_id: null, source: "import_sheet", external_id: description, needs_review: true, ...o,
  });
  const mk = (txs: TxOut[], rules: Plan["rules"] = []): Plan => ({ txs, rules, groups: [], warnings: [], ignored: [], stats: { items: txs.length, created: txs.length, duplicate: 0, ignored: 0, groups: 0, installmentTxs: 0, rules: rules.length } });

  it("aplica regra e IA; o que fica abaixo de 0,80 segue na fila com a sugestão guardada, sem mudar o DRE", async () => {
    const classify = (items: Item[]) => classifyBatch(items, {
      rules: [rule({ match_text: "canva", entity_id: E.av, category_id: C.ferramentas })], history: [],
      ai: async (its) => its.map(() => ({ entity_id: E.casa, category_id: C.mercado, person_id: null, confidence: 0.6, question: "Mercado da Casa?" })),
    });
    const { plan, classified } = await classifyPlan(mk([tx("CANVA"), tx("CANVA"), tx("PAO DE ACUCAR")]), classify);
    expect(classified).toBe(2);
    expect(plan.txs[0]).toMatchObject({ entity_id: E.av, category_id: C.ferramentas, needs_review: false, ai_confidence: 1 });
    expect(plan.txs[2]).toMatchObject({ entity_id: E.casa, category_id: null, needs_review: true, ai_confidence: 0.6, ai_suggestion: { category_id: C.mercado, question: "Mercado da Casa?" } });
  });
  it("pergunta uma vez por descrição diferente, não por lançamento (parcelas e assinaturas)", async () => {
    const classify = vi.fn().mockResolvedValue([{ ...{ entity_id: E.av, category_id: null, person_id: null }, confidence: 1, source: "rule" }]);
    await classifyPlan(mk(Array.from({ length: 12 }, () => tx("MACBOOK"))), classify);
    expect(classify.mock.calls[0][0]).toHaveLength(1);
  });
  it("a regra da assinatura recebe a categoria do lançamento classificado", async () => {
    const rid = ID(900);
    const rules = [{ id: rid, direction: "out" as const, description: "CANVA", amount_cents: 4990, day_of_month: 1, start_month: "2026-11-01", end_month: null, entity_id: E.casa, category_id: null, payment_method_id: itau, client_id: null, active: true as const }];
    const classify = (items: Item[]) => classifyBatch(items, { rules: [rule({ match_text: "canva", entity_id: E.av, category_id: C.ferramentas })], history: [] });
    const { plan } = await classifyPlan(mk([tx("CANVA", { recurring_rule_id: rid, source: "recurring" })], rules), classify);
    expect(plan.rules[0]).toMatchObject({ category_id: C.ferramentas, entity_id: E.av });
  });
  it("respeita o teto de descrições enviadas à IA", async () => {
    const classify = vi.fn().mockImplementation(async (items: Item[]) => items.map(() => ({ entity_id: null, category_id: null, person_id: null, confidence: 0, source: "none" })));
    const many = Array.from({ length: MAX_AI_ITEMS + 30 }, (_, i) => tx(`ITEM ${i}`));
    const { plan } = await classifyPlan(mk(many), classify);
    expect(classify.mock.calls[0][0]).toHaveLength(MAX_AI_ITEMS);
    expect(plan.txs.every((t) => t.needs_review)).toBe(true);
  });
});

import { fitsEntity } from "../categories";
describe("categoria x entidade", () => {
  it("categoria de pessoa física também vale para a Casa; a da empresa só para a empresa", () => {
    expect(fitsEntity("pf", "pf")).toBe(true);
    expect(fitsEntity("pf", "shared")).toBe(true);
    expect(fitsEntity("pf", "pj")).toBe(false);
    expect(fitsEntity("pj", "pj")).toBe(true);
    expect(fitsEntity("pj", "shared")).toBe(false);
    expect(fitsEntity("shared", "shared")).toBe(true);
    expect(fitsEntity(null, "pj")).toBe(true);
    expect(fitsEntity("pf", undefined)).toBe(false);
  });
  it("a IA pode sugerir Mercado (PF) para a Casa", () => {
    const { codes } = buildPrompt(refs, [item("MERCADO")]);
    const r = parseAnswer('{"items":[{"i":0,"entity":"e3","category":"c2","confidence":0.9}]}', codes, refs, 1); // e3 = Casa, c2 = Mercado
    expect(r[0]).toMatchObject({ entity_id: E.casa, category_id: C.mercado });
  });
});
