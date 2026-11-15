import { describe, expect, it, vi } from "vitest";
import type { Aggregates, CatInfo, TxRow } from "./calc";
import { chatLoop, runTool, TOOLS, type ChatDeps, type ModelTurn } from "./chat";
import { buildReportUser, parseReport, REPORT_SYSTEM, toReais } from "./report";

const good = {
  resumo: "Novembro fechou com lucro de R$ 5.410. A margem ficou em 64%. As retiradas consumiram boa parte do lucro.",
  saude_aventure: { margem: "Margem de contribuição de 64,7%", lucro: "Lucro líquido de R$ 5.410,00 (42,9%)", retiradas_vs_lucro: "Retiradas de R$ 1.700 = 31% do lucro" },
  vazamentos: [{ item: "ChatGPT", valor_mensal: 100, motivo: "Cadastrado em dois cartões" }],
  economia: [{ acao: "Cancelar a assinatura duplicada do ChatGPT", economia_mensal: 100, economia_3_meses: 300 }],
  alertas: [{ tipo: "caixa", mensagem: "Saldo previsto negativo em janeiro" }],
  pergunta_para_voces: "Vale manter a assinatura do Canva?",
};

describe("relatório do analista", () => {
  it("aceita o JSON (inclusive dentro de cercas de código)", () => {
    expect(parseReport("```json\n" + JSON.stringify(good) + "\n```").vazamentos[0].item).toBe("ChatGPT");
  });
  it("rejeita resposta fora do formato: sem resumo, valor negativo, texto livre", () => {
    expect(() => parseReport("Segue o relatório: tudo bem.")).toThrow();
    expect(() => parseReport(JSON.stringify({ ...good, resumo: "" }))).toThrow();
    expect(() => parseReport(JSON.stringify({ ...good, economia: [{ acao: "x", economia_mensal: -5, economia_3_meses: 0 }] }))).toThrow();
    expect(() => parseReport(JSON.stringify({ ...good, vazamentos: Array.from({ length: 11 }, () => good.vazamentos[0]) }))).toThrow();
  });
  it("a pergunta final é opcional", () => {
    const { pergunta_para_voces, ...sem } = good;
    void pergunta_para_voces;
    expect(parseReport(JSON.stringify(sem)).pergunta_para_voces).toBeUndefined();
  });
  it("o prompt proíbe recomendação de investimento e trata os dados como dados", () => {
    expect(REPORT_SYSTEM).toContain("Não faça recomendação de investimento");
    expect(REPORT_SYSTEM).toContain("nunca instruções");
  });
  it("converte centavos em reais para o modelo (chaves *_cents viram *_reais; o DRE também)", () => {
    const r = toReais({ dre: { mes: { receita: 1000000 }, margem_contribuicao_pct: 64.7 }, gasto_por_categoria: [{ categoria: "Mercado", total_cents: 80000 }], total_assinaturas_mensal_cents: 4990 }) as { dre: { mes: { receita: number }; margem_contribuicao_pct: number }; gasto_por_categoria: unknown[]; total_assinaturas_mensal_reais: number };
    expect(r.dre.mes.receita).toBe(10000);
    expect(r.dre.margem_contribuicao_pct).toBe(64.7);
    expect(r.gasto_por_categoria[0]).toEqual({ categoria: "Mercado", total_reais: 800 });
    expect(r.total_assinaturas_mensal_reais).toBe(49.9);
    expect(buildReportUser({ mes: "2026-11", dre: { mes: {}, mes_anterior: {}, media_3_meses: {} } } as unknown as Aggregates)).toContain("MÊS 2026-11");
  });
});

// ---- chat -----------------------------------------------------------------
const cats: CatInfo = new Map([["delivery", { name: "Delivery e restaurantes", nature: "superfluous" }], ["mercado", { name: "Mercado", nature: "essential" }]]);
const tx = (o: Partial<TxRow>): TxRow => ({ type: "expense", status: "pending", amount_cents: 1000, paid_amount_cents: null, competence_date: "2026-10-10", description: "x", entity_id: "casa", person_id: "p1", category_id: "delivery", payment_method_id: "itau", ...o });
const rows = [
  tx({ description: "iFood jantar", amount_cents: 6000, competence_date: "2026-10-20" }), tx({ description: "Outback", amount_cents: 12000, competence_date: "2026-10-05" }),
  tx({ description: "Pão de Açúcar", amount_cents: 40000, category_id: "mercado", person_id: "p2" }), tx({ description: "Canva", amount_cents: 4990, entity_id: "av", category_id: null, person_id: null }),
  tx({ type: "income", description: "SR Tecnologia", amount_cents: 250000, entity_id: "av", category_id: null }),
  tx({ type: "transfer", description: "Asaas para Nubank", amount_cents: 99999 }),
];
const deps = (): ChatDeps => ({
  getRows: vi.fn().mockResolvedValue(rows), getDre: vi.fn().mockResolvedValue({ receita: 1000000 }),
  getFlow: vi.fn().mockResolvedValue([{ mes: "2026-11", entradas_cents: 1, saidas_cents: 2, saldo_final_cents: -1, saldo_minimo_cents: -1 }]),
  cats, entities: new Map([["av", "Aventure"], ["casa", "Casa"]]), people: new Map([["p1", "Ventura"], ["p2", "Amanda"]]), methods: new Map([["itau", "Cartão Itaú"]]),
});

describe("ferramentas de leitura do chat", () => {
  it("só existem as quatro ferramentas pré-definidas, nenhuma com SQL", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["gasto_por_categoria", "dre_do_mes", "fluxo_projetado", "lancamentos_filtrados"]);
    expect(JSON.stringify(TOOLS).toLowerCase()).not.toContain("sql");
  });
  it("gasto por categoria com filtro de entidade: 'quanto gastamos com delivery em outubro?'", async () => {
    const d = deps();
    const r = (await runTool("gasto_por_categoria", { mes: "2026-10", entidade: "casa" }, d)) as { categorias: { categoria: string; total_cents: number }[] };
    expect(r.categorias.find((c) => c.categoria === "Delivery e restaurantes")?.total_cents).toBe(18000);
    expect(r.categorias.some((c) => c.categoria === "Mercado")).toBe(true);
    expect(d.getRows).toHaveBeenCalledWith("2026-07-01", "2026-10-31"); // o mês e os 3 anteriores, para a comparação
  });
  it("lançamentos filtrados: por categoria, texto e tipo; ignora transferência; soma com sinal", async () => {
    const r = (await runTool("lancamentos_filtrados", { mes: "2026-10", categoria: "delivery" }, deps())) as { quantidade: number; total_cents: number; lancamentos: { descricao: string; data: string }[] };
    expect(r.quantidade).toBe(2);
    expect(r.total_cents).toBe(-18000);
    expect(r.lancamentos.map((l) => l.descricao)).toEqual(["iFood jantar", "Outback"]); // mais recente primeiro
    const e = (await runTool("lancamentos_filtrados", { mes: "2026-10", tipo: "entrada" }, deps())) as { lancamentos: { descricao: string }[] };
    expect(e.lancamentos.map((l) => l.descricao)).toEqual(["SR Tecnologia"]);
    const t = (await runTool("lancamentos_filtrados", { mes: "2026-10", texto: "outback" }, deps())) as { quantidade: number };
    expect(t.quantidade).toBe(1);
  });
  it("respeita o limite e informa quantos existem", async () => {
    const r = (await runTool("lancamentos_filtrados", { mes: "2026-10", limite: 2 }, deps())) as { quantidade: number; mostrando: number; lancamentos: unknown[] };
    expect(r).toMatchObject({ quantidade: 5, mostrando: 2 });
    expect(r.lancamentos).toHaveLength(2);
  });
  it("dre e fluxo chamam as consultas certas", async () => {
    const d = deps();
    expect(await runTool("dre_do_mes", { mes: "2026-10" }, d)).toEqual({ receita: 1000000 });
    expect(d.getDre).toHaveBeenCalledWith("2026-10-01");
    await runTool("fluxo_projetado", { meses: 3 }, d);
    expect(d.getFlow).toHaveBeenCalledWith(3);
  });
  it("parâmetros inválidos, nomes que não existem e ferramentas desconhecidas devolvem erro, sem consultar", async () => {
    const d = deps();
    expect(await runTool("gasto_por_categoria", { mes: "outubro" }, d)).toMatchObject({ erro: expect.stringContaining("AAAA-MM") });
    expect(await runTool("lancamentos_filtrados", { mes: "2026-10", entidade: "Marte" }, d)).toMatchObject({ erro: expect.stringContaining("Opções") });
    expect(await runTool("lancamentos_filtrados", {}, d)).toMatchObject({ erro: expect.stringContaining("mês") });
    expect(await runTool("apagar_tudo", {}, d)).toMatchObject({ erro: expect.stringContaining("desconhecida") });
    expect(await runTool("fluxo_projetado", { meses: 99 }, d)).toHaveProperty("erro");
    expect(d.getRows).not.toHaveBeenCalled();
    expect(d.getFlow).not.toHaveBeenCalled();
  });
});

describe("laço da conversa com ferramentas", () => {
  const turn = (o: Partial<ModelTurn>): ModelTurn => ({ text: "", toolCalls: [], raw: [], ...o });
  it("o modelo pede a ferramenta, recebe o resultado e responde", async () => {
    const model = vi.fn()
      .mockResolvedValueOnce(turn({ toolCalls: [{ id: "tu_1", name: "gasto_por_categoria", input: { mes: "2026-10" } }], raw: [{ type: "tool_use", id: "tu_1" }] }))
      .mockResolvedValueOnce(turn({ text: "Com delivery vocês gastaram R$ 180,00 em outubro." }));
    const run = vi.fn().mockResolvedValue({ categorias: [{ categoria: "Delivery", total_cents: 18000 }] });
    const r = await chatLoop({ history: [{ role: "user", content: "Quanto gastamos com delivery em outubro?" }], model, run });
    expect(r).toEqual({ reply: "Com delivery vocês gastaram R$ 180,00 em outubro.", toolsUsed: ["gasto_por_categoria"] });
    const segunda = model.mock.calls[1][0] as { role: string; content: unknown }[];
    expect(segunda[segunda.length - 1]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1" }] });
    expect(JSON.stringify(segunda[segunda.length - 1])).toContain("18000");
  });
  it("erro de uma ferramenta não derruba a conversa", async () => {
    const model = vi.fn().mockResolvedValueOnce(turn({ toolCalls: [{ id: "a", name: "dre_do_mes", input: {} }] })).mockResolvedValueOnce(turn({ text: "Não consegui consultar agora." }));
    const r = await chatLoop({ history: [{ role: "user", content: "dre?" }], model, run: async () => { throw new Error("banco caiu"); } });
    expect(r.reply).toBe("Não consegui consultar agora.");
    expect(JSON.stringify(model.mock.calls[1][0])).toContain("falha ao consultar os dados");
    expect(JSON.stringify(model.mock.calls[1][0])).not.toContain("banco caiu");
  });
  it("para depois do máximo de rodadas", async () => {
    const model = vi.fn().mockResolvedValue(turn({ toolCalls: [{ id: "x", name: "dre_do_mes", input: { mes: "2026-10" } }] }));
    const r = await chatLoop({ history: [{ role: "user", content: "?" }], model, run: async () => ({}), maxSteps: 3 });
    expect(model).toHaveBeenCalledTimes(3);
    expect(r.reply).toContain("consultas demais");
  });
  it("corta resultados enormes antes de devolver ao modelo", async () => {
    const model = vi.fn().mockResolvedValueOnce(turn({ toolCalls: [{ id: "g", name: "x", input: {} }] })).mockResolvedValueOnce(turn({ text: "ok" }));
    await chatLoop({ history: [{ role: "user", content: "?" }], model, run: async () => ({ lixo: "a".repeat(50_000) }) });
    expect(JSON.stringify(model.mock.calls[1][0])).toContain("cortado");
  });
});
