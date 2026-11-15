import { describe, expect, it } from "vitest";
import { fakeSupabase } from "./asaas/fake-db.test-helper";
import { generateMonth } from "./generate";

const ORG = "org-1";
const UNIQUE = { transactions: [["org_id", "source", "external_id"]] };
const rule = (id: string, o: Record<string, unknown> = {}) => ({
  id, org_id: ORG, active: true, direction: "out", description: id, amount_cents: 10000, day_of_month: 5, start_month: "2026-09-01", end_month: null,
  entity_id: "e1", category_id: "c1", payment_method_id: null, client_id: null, ...o,
});
const seed = () => ({
  recurring_rules: [rule("Condomínio"), rule("Mensalidade SR", { direction: "in", amount_cents: 250000 }), rule("Canva", { payment_method_id: "itau" }), rule("Toinha cartão", { payment_method_id: "sem-dias" }), rule("Inativa", { active: false })],
  payment_methods: [{ id: "itau", kind: "credit_card", closing_day: 13, due_day: 20 }, { id: "sem-dias", kind: "credit_card", closing_day: null, due_day: null }],
  transactions: [] as Record<string, unknown>[],
});

describe("gerador de recorrências do mês (critério de aceite da etapa 5)", () => {
  it("gera os previstos do mês, pulando a regra inativa e o cartão sem fechamento", async () => {
    const f = fakeSupabase(seed(), UNIQUE);
    const r = await generateMonth(f.client, "2026-11-01", ORG);
    expect(r).toEqual({ rules: 4, generated: 3, created: 3, skipped: 1 });
    const txs = f.db.transactions;
    expect(txs.map((t) => t.description).sort()).toEqual(["Canva", "Condomínio", "Mensalidade SR"]);
    expect(txs.find((t) => t.description === "Mensalidade SR")).toMatchObject({ type: "income", status: "forecast", cash_date: "2026-11-05", source: "recurring" });
    expect(txs.find((t) => t.description === "Canva")).toMatchObject({ invoice_month: "2026-11-01", cash_date: "2026-11-20" }); // dia 5 < fechamento 13: fatura de novembro
  });
  it("rodar o cron duas vezes não duplica nada", async () => {
    const f = fakeSupabase(seed(), UNIQUE);
    await generateMonth(f.client, "2026-11-01", ORG);
    const antes = JSON.stringify(f.db.transactions);
    const again = await generateMonth(f.client, "2026-11-01", ORG);
    expect(again).toMatchObject({ generated: 3, created: 0 });
    expect(JSON.stringify(f.db.transactions)).toBe(antes);
  });
  it("mês seguinte gera de novo, sem mexer no anterior", async () => {
    const f = fakeSupabase(seed(), UNIQUE);
    await generateMonth(f.client, "2026-11-01", ORG);
    expect((await generateMonth(f.client, "2026-12-01", ORG)).created).toBe(3);
    expect(f.db.transactions).toHaveLength(6);
  });
  it("respeita o início e o fim da regra", async () => {
    const f = fakeSupabase({ ...seed(), recurring_rules: [rule("Futura", { start_month: "2027-01-01" }), rule("Acabou", { end_month: "2026-10-01" })] }, UNIQUE);
    expect(await generateMonth(f.client, "2026-11-01", ORG)).toMatchObject({ generated: 0, created: 0 });
  });
  it("só as regras da organização pedida", async () => {
    const f = fakeSupabase({ ...seed(), recurring_rules: [rule("Minha"), rule("De outra org", { org_id: "org-2" })] }, UNIQUE);
    const r = await generateMonth(f.client, "2026-11-01", ORG);
    expect(r.rules).toBe(1);
    expect(f.db.transactions.every((t) => t.org_id === ORG)).toBe(true);
  });
  it("erro do banco vira exceção (o cron avisa em vez de fingir que deu certo)", async () => {
    const f = fakeSupabase(seed(), UNIQUE);
    f.failNext("transactions", "upsert", "disco cheio");
    await expect(generateMonth(f.client, "2026-11-01", ORG)).rejects.toThrow(/lançamentos/);
  });
});
