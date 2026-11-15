import { describe, expect, it } from "vitest";
import { categorySchema, paymentMethodSchema, settingsSchema } from "./schemas";

const ent = "20000000-0000-4000-8000-00000000000a";
const pm = (o: Record<string, string> = {}) => ({
  name: "Cartão Itaú", kind: "credit_card", holder_person_id: "", owner_entity_id: ent,
  closing_day: "13", due_day: "20", credit_limit_cents: "300,00", active: "on", ...o,
});

describe("meio de pagamento", () => {
  it("aceita o cartão completo e converte tipos", () => {
    const r = paymentMethodSchema.parse(pm());
    expect(r).toMatchObject({ closing_day: 13, due_day: 20, credit_limit_cents: 30000, active: true, holder_person_id: null });
  });
  it("aceita dias e limite em branco (a confirmar)", () => {
    const r = paymentMethodSchema.parse(pm({ closing_day: "", due_day: "", credit_limit_cents: "", active: "" }));
    expect(r).toMatchObject({ closing_day: null, due_day: null, credit_limit_cents: null, active: false });
  });
  it("rejeita dia fora de 1 a 31 e valor inválido", () => {
    expect(paymentMethodSchema.safeParse(pm({ closing_day: "32" })).success).toBe(false);
    expect(paymentMethodSchema.safeParse(pm({ due_day: "0" })).success).toBe(false);
    expect(paymentMethodSchema.safeParse(pm({ credit_limit_cents: "abc" })).success).toBe(false);
  });
});

describe("categoria", () => {
  const cat = (o: Record<string, string> = {}) => ({
    name: "Contas da casa", applies_to: "", direction: "out", dre_line: "none", nature: "essential", pj_share_pct: "30", ...o,
  });
  it("converte rateio e campos vazios", () => {
    expect(categorySchema.parse(cat())).toMatchObject({ applies_to: null, pj_share_pct: 30 });
  });
  it("rejeita rateio acima de 100 e linha desconhecida", () => {
    expect(categorySchema.safeParse(cat({ pj_share_pct: "101" })).success).toBe(false);
    expect(categorySchema.safeParse(cat({ dre_line: "xyz" })).success).toBe(false);
  });
});

describe("alíquota do Simples", () => {
  it("6,5% vira 0.065", () => {
    expect(settingsSchema.parse({ simples_effective_rate: "6,5" }).simples_effective_rate).toBe(0.065);
  });
  it("vazio vira null e acima de 33% é rejeitado", () => {
    expect(settingsSchema.parse({ simples_effective_rate: "" }).simples_effective_rate).toBeNull();
    expect(settingsSchema.safeParse({ simples_effective_rate: "40" }).success).toBe(false);
  });
});

import { recurringRuleSchema } from "./schemas";
describe("regra recorrente", () => {
  const r = (o: Record<string, string> = {}) => ({
    direction: "out", description: "ChatGPT", amount_cents: "100,00", day_of_month: "5", start_month: "2026-09", end_month: "",
    entity_id: "20000000-0000-4000-8000-00000000000a", category_id: "", payment_method_id: "", client_id: "", active: "on", ...o,
  });
  it("converte mês para dia 1 e valor para centavos", () => {
    expect(recurringRuleSchema.parse(r())).toMatchObject({ amount_cents: 10000, start_month: "2026-09-01", end_month: null, day_of_month: 5, active: true });
  });
  it("rejeita mês final antes do início, valor zero e dia inválido", () => {
    expect(recurringRuleSchema.safeParse(r({ end_month: "2026-08" })).success).toBe(false);
    expect(recurringRuleSchema.safeParse(r({ amount_cents: "0" })).success).toBe(false);
    expect(recurringRuleSchema.safeParse(r({ day_of_month: "32" })).success).toBe(false);
    expect(recurringRuleSchema.safeParse(r({ start_month: "" })).success).toBe(false);
  });
});
