import { describe, expect, it } from "vitest";
import { isPaidEvent, paidDateOf, pickExpected, planPayment, toCents, type Defaults, type ExistingLink, type ExpectedTx } from "./payments";
import { paymentSchema, webhookSchema, type AsaasPayment } from "./types";

const defaults: Defaults = { pjEntityId: "e-av", revenueCategoryId: "c-mens", feeCategoryId: "c-fee", methodId: "m-asaas" };
const client = { id: "cli-sr", name: "SR Tecnologia" };
const pay = (o: Partial<AsaasPayment> = {}): AsaasPayment => ({ id: "pay_1", customer: "cus_1", value: 2500, netValue: 2498.01, status: "RECEIVED", dueDate: "2026-11-10", paymentDate: "2026-11-09", description: "Mensalidade novembro", ...o });
const exp = (id: string, cents: number, cash: string, status = "forecast"): ExpectedTx => ({ id, amount_cents: cents, cash_date: cash, status });
const plan = (o: { event?: string; payment?: AsaasPayment; existing?: ExistingLink; candidates?: ExpectedTx[]; client?: typeof client | null } = {}) =>
  planPayment({ event: o.event ?? "PAYMENT_RECEIVED", payment: o.payment ?? pay(), client: o.client === undefined ? client : o.client, existing: o.existing ?? null, candidates: o.candidates ?? [], defaults, today: "2026-11-14" });

describe("leitura do webhook", () => {
  it("aceita o formato do Asaas com campos a mais", () => {
    const w = webhookSchema.parse({ id: "evt_1", event: "PAYMENT_RECEIVED", dateCreated: "2026-11-09", payment: { object: "payment", id: "pay_1", customer: "cus_1", value: 2500, netValue: 2498.01, billingType: "PIX", status: "RECEIVED", extra: 1 } });
    expect(w.payment?.id).toBe("pay_1");
  });
  it("rejeita sem evento ou sem valor", () => {
    expect(webhookSchema.safeParse({ payment: {} }).success).toBe(false);
    expect(paymentSchema.safeParse({ id: "x", customer: "c" }).success).toBe(false);
  });
});

describe("valores e datas", () => {
  it("centavos sem erro de ponto flutuante", () => {
    expect(toCents(2500)).toBe(250000);
    expect(toCents(19.9)).toBe(1990);
    expect(toCents(2498.01)).toBe(249801);
  });
  it("data do dinheiro: pagamento, depois pagamento do cliente, depois confirmação, senão hoje", () => {
    expect(paidDateOf(pay({ paymentDate: "2026-11-09" }), "2026-11-14")).toBe("2026-11-09");
    expect(paidDateOf(pay({ paymentDate: null, clientPaymentDate: "2026-11-08" }), "2026-11-14")).toBe("2026-11-08");
    expect(paidDateOf(pay({ paymentDate: null, clientPaymentDate: null, confirmedDate: "2026-11-07" }), "2026-11-14")).toBe("2026-11-07");
    expect(paidDateOf(pay({ paymentDate: null }), "2026-11-14")).toBe("2026-11-14");
  });
  it("evento de pago (recebido, confirmado, em dinheiro)", () => {
    expect(isPaidEvent("PAYMENT_RECEIVED")).toBe(true);
    expect(isPaidEvent("PAYMENT_CONFIRMED")).toBe(true);
    expect(isPaidEvent("PAYMENT_OVERDUE")).toBe(false);
  });
});

describe("qual cobrança esperada é baixada", () => {
  it("a não paga mais próxima do vencimento; ignora as já pagas e as muito distantes", () => {
    const c = [exp("a", 250000, "2026-10-10", "paid"), exp("b", 250000, "2026-11-10"), exp("c", 250000, "2026-12-10")];
    expect(pickExpected(c, "2026-11-10", 250000)?.id).toBe("b");
    expect(pickExpected([exp("z", 250000, "2027-03-10")], "2026-11-10", 250000)).toBeNull();
    expect(pickExpected([], "2026-11-10", 1)).toBeNull();
  });
  it("empate de data: o valor mais parecido", () => {
    const c = [exp("a", 100000, "2026-11-10"), exp("b", 250000, "2026-11-10")];
    expect(pickExpected(c, "2026-11-10", 250000)?.id).toBe("b");
  });
});

describe("decisão sobre o pagamento", () => {
  it("baixa a mensalidade esperada com o valor real e a data do dinheiro, e registra a tarifa", () => {
    const p = plan({ candidates: [exp("t1", 250000, "2026-11-10")] });
    expect(p).toMatchObject({ kind: "mark", txId: "t1", patch: { status: "paid", paid_amount_cents: 250000, cash_date: "2026-11-09" }, prevCashDate: "2026-11-10" });
    expect(p.kind === "mark" && p.fee).toMatchObject({ description: "Tarifa Asaas", amount_cents: 199, external_id: "asaas:fee:pay_1", category_id: "c-fee", type: "expense" });
  });
  it("valor pago diferente do previsto vale o real", () => {
    const p = plan({ payment: pay({ value: 2400, netValue: 2400 }), candidates: [exp("t1", 250000, "2026-11-10")] });
    expect(p).toMatchObject({ kind: "mark", patch: { paid_amount_cents: 240000 } });
    expect(p.kind === "mark" && p.fee).toBeNull(); // sem tarifa
  });
  it("sem mensalidade esperada, cria a entrada avulsa ligada ao cliente, com chave única da cobrança", () => {
    const p = plan({ candidates: [] });
    expect(p).toMatchObject({ kind: "create", row: { type: "income", status: "paid", amount_cents: 250000, client_id: "cli-sr", source: "asaas", external_id: "asaas:pay:pay_1", entity_id: "e-av", category_id: "c-mens", needs_review: false } });
  });
  it("'confirmado' e depois 'recebido' não contam em dobro", () => {
    const existing: ExistingLink = { status: "paid", transaction_id: "t1", fee_transaction_id: null, prev_cash_date: "2026-11-10" };
    expect(plan({ event: "PAYMENT_CONFIRMED", existing })).toEqual({ kind: "already" });
    expect(plan({ event: "PAYMENT_RECEIVED", existing })).toEqual({ kind: "already" });
  });
  it("cliente do Asaas não vinculado é ignorado com motivo", () => {
    expect(plan({ client: null })).toEqual({ kind: "ignore", reason: expect.stringContaining("não está vinculado") });
  });
  it("eventos sem ação (vencida, criada) são ignorados", () => {
    expect(plan({ event: "PAYMENT_OVERDUE" })).toMatchObject({ kind: "ignore" });
    expect(plan({ event: "PAYMENT_CREATED" })).toMatchObject({ kind: "ignore" });
  });
  it("estorno volta a mensalidade para pendente, com a data de caixa original, e remove a tarifa", () => {
    const existing: ExistingLink = { status: "paid", transaction_id: "t1", fee_transaction_id: "f1", prev_cash_date: "2026-11-10" };
    expect(plan({ event: "PAYMENT_REFUNDED", existing })).toEqual({ kind: "refund", txId: "t1", patch: { status: "pending", paid_amount_cents: null, cash_date: "2026-11-10" }, removeFeeTxId: "f1" });
    expect(plan({ event: "PAYMENT_REFUNDED", existing: null })).toMatchObject({ kind: "ignore" });
  });
  it("valor zerado e falta de entidade PJ são ignorados", () => {
    expect(plan({ payment: pay({ value: 0, netValue: 0 }) })).toMatchObject({ kind: "ignore" });
    const semPj = planPayment({ event: "PAYMENT_RECEIVED", payment: pay(), client, existing: null, candidates: [], defaults: { ...defaults, pjEntityId: null }, today: "2026-11-14" });
    expect(semPj).toMatchObject({ kind: "ignore" });
  });
  it("sem categoria de receita cadastrada, a entrada vai para revisão", () => {
    const p = planPayment({ event: "PAYMENT_RECEIVED", payment: pay(), client, existing: null, candidates: [], defaults: { ...defaults, revenueCategoryId: null }, today: "2026-11-14" });
    expect(p.kind === "create" && p.row.needs_review).toBe(true);
  });
});
