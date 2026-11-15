import { describe, expect, it } from "vitest";
import { buildLaunch, launchSchema, type LaunchInput, type MethodInfo } from "./launch";

const ID = "00000000-0000-4000-8000-000000000001";
const ENT = "20000000-0000-4000-8000-00000000000a";
const itau: MethodInfo = { id: "30000000-0000-4000-8000-000000000001", kind: "credit_card", closing_day: 13, due_day: 20 };
const alexandre: MethodInfo = { id: "30000000-0000-4000-8000-000000000002", kind: "credit_card", closing_day: 29, due_day: 6 };
const semDias: MethodInfo = { id: "30000000-0000-4000-8000-000000000003", kind: "credit_card", closing_day: null, due_day: null };
const pix: MethodInfo = { id: "30000000-0000-4000-8000-000000000004", kind: "pix", closing_day: null, due_day: null };
const conta: MethodInfo = { id: "30000000-0000-4000-8000-000000000005", kind: "bank_account", closing_day: null, due_day: null };

const input = (o: Partial<LaunchInput> = {}): LaunchInput =>
  launchSchema.parse({
    id: ID, type: "expense", description: "Cometa", amount_cents: 4500, date: "2026-11-10",
    payment_method_id: itau.id, entity_id: ENT, person_id: null, category_id: "40000000-0000-4000-8000-000000000001", ...o,
  });

function ok(r: ReturnType<typeof buildLaunch>) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("compra à vista no cartão", () => {
  it("vai para a fatura certa, pendente, com data de caixa no vencimento", () => {
    const { group, rows } = ok(buildLaunch(input(), itau));
    expect(group).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending", paid_amount_cents: null, competence_date: "2026-11-10",
      invoice_month: "2026-11-01", cash_date: "2026-11-20", installment_number: null, needs_review: false,
    });
  });
  it("compra no dia do fechamento entra na fatura seguinte, mas a competência continua em novembro", () => {
    const { rows } = ok(buildLaunch(input({ date: "2026-11-13" }), itau));
    expect(rows[0]).toMatchObject({ competence_date: "2026-11-13", invoice_month: "2026-12-01", cash_date: "2026-12-20" });
  });
  it("cartão do Alexandre (fecha 29, vence 6)", () => {
    const a = ok(buildLaunch(input({ date: "2026-11-10", payment_method_id: alexandre.id }), alexandre)).rows[0];
    expect(a).toMatchObject({ invoice_month: "2026-12-01", cash_date: "2026-12-06" });
    const b = ok(buildLaunch(input({ date: "2026-11-29", payment_method_id: alexandre.id }), alexandre)).rows[0];
    expect(b).toMatchObject({ invoice_month: "2027-01-01", cash_date: "2027-01-06" });
  });
  it("exige fechamento e vencimento do cartão", () => {
    const r = buildLaunch(input({ payment_method_id: semDias.id }), semDias);
    expect(r).toMatchObject({ ok: false });
  });
});

describe("compra parcelada", () => {
  it("3x de R$ 45,00: um grupo e uma linha por parcela, cada uma na sua fatura", () => {
    const { group, rows } = ok(buildLaunch(input({ installments: 3, date: "2026-11-14" }), itau));
    expect(group).toMatchObject({ id: ID, installments: 3, installment_cents: 1500, first_invoice_month: "2026-12-01", purchase_date: "2026-11-14" });
    expect(rows.map((r) => r.amount_cents)).toEqual([1500, 1500, 1500]);
    expect(rows.map((r) => r.invoice_month)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(rows.map((r) => r.cash_date)).toEqual(["2026-12-20", "2027-01-20", "2027-02-20"]);
    expect(rows.map((r) => r.installment_number)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.competence_date)).toEqual(["2026-11-14", "2026-12-14", "2027-01-14"]);
    expect(new Set(rows.map((r) => r.installment_group_id))).toEqual(new Set([ID]));
  });
  it("o resto de centavos vai para a 1ª parcela e a soma fecha com o total", () => {
    const { rows } = ok(buildLaunch(input({ amount_cents: 10000, installments: 3 }), itau));
    expect(rows.map((r) => r.amount_cents)).toEqual([3334, 3333, 3333]);
  });
  it("MacBook em 12x com o cartão do Alexandre", () => {
    const { rows } = ok(buildLaunch(input({ amount_cents: 1200000, installments: 12, date: "2026-11-10", payment_method_id: alexandre.id }), alexandre));
    expect(rows).toHaveLength(12);
    expect(rows[0].invoice_month).toBe("2026-12-01");
    expect(rows[11].invoice_month).toBe("2027-11-01");
    expect(rows[11].cash_date).toBe("2027-11-06");
  });
  it("só cartão de crédito parcela", () => {
    expect(buildLaunch(input({ installments: 3, payment_method_id: pix.id }), pix)).toMatchObject({ ok: false });
    expect(buildLaunch(input({ installments: 2, type: "income" }), itau)).toMatchObject({ ok: false });
  });
  it("idempotência: external_id derivado do id do lançamento", () => {
    const a = ok(buildLaunch(input({ installments: 3 }), itau)).rows.map((r) => r.external_id);
    const b = ok(buildLaunch(input({ installments: 3 }), itau)).rows.map((r) => r.external_id);
    expect(a).toEqual([`${ID}:1`, `${ID}:2`, `${ID}:3`]);
    expect(b).toEqual(a);
  });
});

describe("outros meios, entradas e revisão", () => {
  it("pix sai no dia e já fica pago", () => {
    const { rows } = ok(buildLaunch(input({ payment_method_id: pix.id }), pix));
    expect(rows[0]).toMatchObject({ status: "paid", paid_amount_cents: 4500, cash_date: "2026-11-10", invoice_month: null });
  });
  it("entrada sem meio é aceita", () => {
    const { rows } = ok(buildLaunch(input({ type: "income", payment_method_id: null }), null));
    expect(rows[0]).toMatchObject({ type: "income", status: "paid", cash_date: "2026-11-10" });
  });
  it("saída exige meio de pagamento", () => {
    expect(buildLaunch(input({ payment_method_id: null }), null)).toMatchObject({ ok: false });
  });
  it("sem categoria vai para a fila de revisão", () => {
    expect(ok(buildLaunch(input({ category_id: null }), itau)).rows[0].needs_review).toBe(true);
  });
});

describe("transferência", () => {
  it("gera duas pernas ligadas pelo mesmo par, sem categoria", () => {
    const { rows } = ok(buildLaunch(input({ type: "transfer", description: "Asaas para Nubank", amount_cents: 100000, payment_method_id: conta.id, to_payment_method_id: pix.id }), conta, pix));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.payment_method_id)).toEqual([conta.id, pix.id]);
    expect(new Set(rows.map((r) => r.transfer_pair_id))).toEqual(new Set([ID]));
    expect(rows.every((r) => r.type === "transfer" && r.category_id === null && !r.needs_review)).toBe(true);
    expect(rows.map((r) => r.external_id)).toEqual([`${ID}:out`, `${ID}:in`]);
  });
  it("origem e destino diferentes", () => {
    expect(buildLaunch(input({ type: "transfer", payment_method_id: conta.id }), conta, conta)).toMatchObject({ ok: false });
  });
});

describe("validação do lançamento", () => {
  it("rejeita valor zero, data inexistente e id inválido", () => {
    expect(() => input({ amount_cents: 0 })).toThrow();
    expect(() => input({ date: "2026-02-30" })).toThrow();
    expect(() => input({ id: "abc" })).toThrow();
  });
});
