import { beforeEach, describe, expect, it } from "vitest";
import { fakeSupabase } from "./fake-db.test-helper";
import { processWebhook } from "./process";
import { webhookSchema } from "./types";

const ORG = "org-1";
const UNIQUE = {
  asaas_events: [["org_id", "event_id"]], asaas_payments: [["org_id", "payment_id"]],
  transactions: [["org_id", "source", "external_id"]],
};
const seed = () => ({
  clients: [{ id: "cli-sr", name: "SR Tecnologia", asaas_customer_id: "cus_1" }],
  entities: [{ id: "e-av", kind: "pj" }],
  categories: [
    { id: "c-mens", name: "Mensalidade de cliente", direction: "in", dre_line: "gross_revenue" },
    { id: "c-sis", name: "Sistemas e fornecedores", direction: "out", dre_line: "admin_expenses" },
  ],
  payment_methods: [{ id: "m-asaas", name: "Conta Asaas PJ", kind: "bank_account" }],
  transactions: [{ id: "t-nov", client_id: "cli-sr", type: "income", status: "forecast", amount_cents: 250000, cash_date: "2026-11-10", org_id: ORG, source: "recurring", external_id: "r1:2026-11" }],
});
const evt = (o: { id?: string; event?: string; payment?: object } = {}) => webhookSchema.parse({
  id: o.id ?? "evt_1", event: o.event ?? "PAYMENT_RECEIVED",
  payment: { id: "pay_1", customer: "cus_1", value: 2500, netValue: 2498.01, status: "RECEIVED", dueDate: "2026-11-10", paymentDate: "2026-11-09", ...o.payment },
});
const ctx = { orgId: ORG, userId: null, today: "2026-11-14" };

let f: ReturnType<typeof fakeSupabase>;
beforeEach(() => { f = fakeSupabase(seed(), UNIQUE); });

describe("webhook do Asaas, do começo ao fim", () => {
  it("baixa a mensalidade do cliente com o valor real e a data do dinheiro, e registra a tarifa", async () => {
    const r = await processWebhook(f.client, ctx, evt());
    expect(r).toMatchObject({ duplicate: false, result: "done" });
    expect(f.db.transactions.find((t) => t.id === "t-nov")).toMatchObject({ status: "paid", paid_amount_cents: 250000, cash_date: "2026-11-09" });
    const fee = f.db.transactions.find((t) => t.external_id === "asaas:fee:pay_1");
    expect(fee).toMatchObject({ type: "expense", amount_cents: 199, category_id: "c-sis", payment_method_id: "m-asaas", source: "asaas" });
    expect(f.db.asaas_payments[0]).toMatchObject({ payment_id: "pay_1", status: "paid", transaction_id: "t-nov", prev_cash_date: "2026-11-10", fee_transaction_id: fee!.id });
    expect(f.db.asaas_events[0]).toMatchObject({ event_id: "evt_1", result: "done" });
  });

  it("o mesmo evento duas vezes não duplica nada", async () => {
    await processWebhook(f.client, ctx, evt());
    const antes = JSON.stringify(f.db.transactions);
    const r = await processWebhook(f.client, ctx, evt());
    expect(r).toMatchObject({ duplicate: true });
    expect(JSON.stringify(f.db.transactions)).toBe(antes);
    expect(f.db.asaas_events).toHaveLength(1);
  });

  it("'confirmado' e depois 'recebido' (eventos diferentes, mesma cobrança) contam uma vez só", async () => {
    await processWebhook(f.client, ctx, evt({ id: "evt_a", event: "PAYMENT_CONFIRMED" }));
    const r = await processWebhook(f.client, ctx, evt({ id: "evt_b", event: "PAYMENT_RECEIVED" }));
    expect(r).toMatchObject({ duplicate: false, result: "ignored", detail: expect.stringContaining("já baixada") });
    expect(f.db.transactions.filter((t) => t.source === "asaas" && t.type === "expense")).toHaveLength(1); // 1 tarifa
    expect(f.db.transactions.filter((t) => t.status === "paid" && t.type === "income")).toHaveLength(1);
    expect(f.db.asaas_payments).toHaveLength(1);
  });

  it("sem mensalidade esperada, cria a entrada avulsa uma única vez", async () => {
    f = fakeSupabase({ ...seed(), transactions: [] }, UNIQUE);
    await processWebhook(f.client, ctx, evt({ id: "evt_1" }));
    await processWebhook(f.client, ctx, evt({ id: "evt_2", event: "PAYMENT_CONFIRMED" }));
    const entradas = f.db.transactions.filter((t) => t.type === "income");
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({ source: "asaas", external_id: "asaas:pay:pay_1", client_id: "cli-sr", amount_cents: 250000, status: "paid", category_id: "c-mens", entity_id: "e-av" });
  });

  it("estorno volta a mensalidade para pendente, com a data original, e remove a tarifa", async () => {
    await processWebhook(f.client, ctx, evt());
    await processWebhook(f.client, ctx, evt({ id: "evt_r", event: "PAYMENT_REFUNDED", payment: { status: "REFUNDED" } }));
    expect(f.db.transactions.find((t) => t.id === "t-nov")).toMatchObject({ status: "pending", paid_amount_cents: null, cash_date: "2026-11-10" });
    expect(f.db.transactions.some((t) => t.external_id === "asaas:fee:pay_1")).toBe(false);
    expect(f.db.asaas_payments[0].status).toBe("refunded");
  });

  it("cliente do Asaas que não está vinculado é ignorado, sem criar lançamento", async () => {
    const r = await processWebhook(f.client, ctx, evt({ payment: { customer: "cus_desconhecido" } }));
    expect(r).toMatchObject({ result: "ignored", detail: expect.stringContaining("não está vinculado") });
    expect(f.db.transactions).toHaveLength(1);
    expect(f.db.asaas_events[0].result).toBe("ignored");
  });

  it("eventos que não são de pagamento (vencida, criada) só ficam registrados", async () => {
    const r = await processWebhook(f.client, ctx, evt({ id: "evt_o", event: "PAYMENT_OVERDUE", payment: { status: "OVERDUE" } }));
    expect(r.result).toBe("ignored");
    expect(f.db.transactions.find((t) => t.id === "t-nov")!.status).toBe("forecast");
  });

  it("falha no meio: o evento fica como erro e é reprocessado quando o Asaas reenviar, sem duplicar", async () => {
    f.failNext("transactions", "update");
    await expect(processWebhook(f.client, ctx, evt())).rejects.toThrow(/baixa/);
    expect(f.db.asaas_events[0].result).toBe("error");
    expect(f.db.transactions.find((t) => t.id === "t-nov")!.status).toBe("forecast");

    const r = await processWebhook(f.client, ctx, evt()); // reenvio do mesmo evento
    expect(r).toMatchObject({ duplicate: false, result: "done" });
    expect(f.db.transactions.find((t) => t.id === "t-nov")).toMatchObject({ status: "paid", paid_amount_cents: 250000 });
    expect(f.db.asaas_events).toHaveLength(1);
    expect(f.db.transactions.filter((t) => t.external_id === "asaas:fee:pay_1")).toHaveLength(1);
  });

  it("sem id de evento, usa uma chave derivada (evento + cobrança + status)", async () => {
    const e = webhookSchema.parse({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", customer: "cus_1", value: 2500, status: "RECEIVED", dueDate: "2026-11-10" } });
    await processWebhook(f.client, ctx, e);
    expect(f.db.asaas_events[0].event_id).toBe("PAYMENT_RECEIVED:pay_1:RECEIVED");
    expect((await processWebhook(f.client, ctx, e)).duplicate).toBe(true);
  });
});
