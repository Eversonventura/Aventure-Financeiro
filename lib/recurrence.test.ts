import { describe, expect, it } from "vitest";
import type { MethodInfo } from "./launch";
import { buildRecurring, type RuleRow } from "./recurrence";

const rule = (o: Partial<RuleRow> = {}): RuleRow => ({
  id: "50000000-0000-4000-8000-000000000001", org_id: "10000000-0000-4000-8000-00000000000a", direction: "out",
  description: "ChatGPT", amount_cents: 10000, day_of_month: 5, start_month: "2026-09-01", end_month: null,
  entity_id: "20000000-0000-4000-8000-00000000000a", category_id: "30000000-0000-4000-8000-000000000001",
  payment_method_id: null, client_id: null, active: true, ...o,
});
const itau: MethodInfo = { id: "m1", kind: "credit_card", closing_day: 13, due_day: 20 };
const pix: MethodInfo = { id: "m2", kind: "pix", closing_day: null, due_day: null };

describe("buildRecurring", () => {
  it("gera o previsto do mês, com chave única por regra e mês", () => {
    const r = buildRecurring(rule(), "2026-11-01", null);
    expect(r).toMatchObject({ ok: true, row: {
      type: "expense", status: "forecast", competence_date: "2026-11-05", cash_date: "2026-11-05",
      invoice_month: null, source: "recurring", external_id: "50000000-0000-4000-8000-000000000001:2026-11", needs_review: false,
    } });
  });
  it("respeita início e fim (inclusive os dois meses das pontas)", () => {
    expect(buildRecurring(rule(), "2026-08-01", null)).toEqual({ ok: false, reason: "out_of_range" });
    expect(buildRecurring(rule(), "2026-09-01", null).ok).toBe(true);
    const fim = rule({ end_month: "2026-12-01" });
    expect(buildRecurring(fim, "2026-12-01", null).ok).toBe(true);
    expect(buildRecurring(fim, "2027-01-01", null)).toEqual({ ok: false, reason: "out_of_range" });
  });
  it("regra inativa não gera", () => {
    expect(buildRecurring(rule({ active: false }), "2026-11-01", null)).toEqual({ ok: false, reason: "inactive" });
  });
  it("dia 31 vira o último dia dos meses curtos", () => {
    const r = buildRecurring(rule({ day_of_month: 31 }), "2027-02-01", null);
    expect(r.ok && r.row.competence_date).toBe("2027-02-28");
  });
  it("assinatura no cartão: cai na fatura certa e o caixa é o vencimento", () => {
    const antes = buildRecurring(rule({ payment_method_id: "m1", day_of_month: 5 }), "2026-11-01", itau);
    expect(antes.ok && antes.row).toMatchObject({ competence_date: "2026-11-05", invoice_month: "2026-11-01", cash_date: "2026-11-20" });
    const depois = buildRecurring(rule({ payment_method_id: "m1", day_of_month: 20 }), "2026-11-01", itau);
    expect(depois.ok && depois.row).toMatchObject({ competence_date: "2026-11-20", invoice_month: "2026-12-01", cash_date: "2026-12-20" });
  });
  it("cartão sem fechamento/vencimento é pulado", () => {
    const r = buildRecurring(rule({ payment_method_id: "m3" }), "2026-11-01", { id: "m3", kind: "credit_card", closing_day: null, due_day: null });
    expect(r).toEqual({ ok: false, reason: "card_without_days" });
  });
  it("mensalidade de cliente é entrada e pix sai no dia", () => {
    const r = buildRecurring(rule({ direction: "in", payment_method_id: "m2", client_id: "c1" }), "2026-11-01", pix);
    expect(r.ok && r.row).toMatchObject({ type: "income", cash_date: "2026-11-05", client_id: "c1" });
  });
  it("sem categoria vai para revisão", () => {
    const r = buildRecurring(rule({ category_id: null }), "2026-11-01", null);
    expect(r.ok && r.row.needs_review).toBe(true);
  });
});
