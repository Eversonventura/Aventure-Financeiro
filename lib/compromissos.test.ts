import { describe, expect, it } from "vitest";
import { createSchema, dueDate, editSchema, externalId, installmentRow, monthlyLoad, nFromExternal, planSync, summarize, type Commitment } from "./compromissos";

const ID = "00000000-0000-4000-8000-0000000000aa";
const ENT = "20000000-0000-4000-8000-000000000001";
const c = (o: Partial<Commitment> = {}): Commitment => ({
  id: ID, kind: "consortium", name: "Consórcio Moto", entity_id: ENT, institution: null, payment_method_id: null, category_id: null,
  installment_cents: 85000, installments: 12, paid_before: 4, first_due_date: "2026-07-10", contracted_cents: null, contemplated_on: null, notes: null, active: true, ...o,
});

describe("cronograma das parcelas", () => {
  it("vencimento da parcela n a partir da 1ª, sem escorregar o dia em meses curtos", () => {
    expect(dueDate("2026-07-10", 1)).toBe("2026-07-10");
    expect(dueDate("2026-07-10", 6)).toBe("2026-12-10");
    expect(dueDate("2026-01-31", 2)).toBe("2026-02-28");
    expect(dueDate("2026-01-31", 3)).toBe("2026-03-31"); // volta ao dia 31
    expect(dueDate("2026-11-30", 4)).toBe("2027-02-28");
  });
  it("a parcela vira um lançamento previsto, com chave única e descrição n/N", () => {
    const r = installmentRow(c(), 5);
    expect(r).toMatchObject({
      type: "expense", status: "forecast", description: "Consórcio Moto 5/12", amount_cents: 85000, cash_date: "2026-11-10", competence_date: "2026-11-10",
      commitment_id: ID, source: "recurring", external_id: externalId(ID, 5), needs_review: false,
    });
    expect(nFromExternal(r.external_id, ID)).toBe(5);
    expect(nFromExternal("outra:coisa", ID)).toBeNull();
  });
});

describe("sincronizar as parcelas com o cadastro", () => {
  it("cria só as parcelas que faltam (as pagas antes de cadastrar não entram)", () => {
    const p = planSync(c(), []);
    expect(p.create.map((x) => x.external_id)).toEqual([5, 6, 7, 8, 9, 10, 11, 12].map((n) => externalId(ID, n)));
    expect(p.create[0].cash_date).toBe("2026-11-10");
    expect(p.create[7].cash_date).toBe("2027-06-10");
  });
  it("mudar o valor atualiza só as não pagas; a paga nunca é mexida", () => {
    const existing = [{ id: "t5", n: 5, status: "paid" }, { id: "t6", n: 6, status: "forecast" }, { id: "t7", n: 7, status: "forecast" }];
    const p = planSync(c({ installment_cents: 90000 }), existing);
    expect(p.update.map((u) => u.id)).toEqual(["t6", "t7"]);
    expect(p.update[0].patch.amount_cents).toBe(90000);
    expect(p.create).toHaveLength(5); // 8..12
  });
  it("aumentar o total cria as novas; diminuir remove as não pagas que passaram do total", () => {
    const mais = planSync(c({ installments: 14 }), [5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ id: `t${n}`, n, status: "forecast" })));
    expect(mais.create.map((x) => x.external_id)).toEqual([externalId(ID, 13), externalId(ID, 14)]);
    const menos = planSync(c({ installments: 8 }), [5, 6, 7, 8, 9, 10].map((n) => ({ id: `t${n}`, n, status: n === 9 ? "paid" : "forecast" })));
    expect(menos.remove).toEqual(["t10"]); // a 9 está paga e fica; a 10 sai
  });
  it("encerrar remove as parcelas futuras não pagas e mantém as pagas", () => {
    const p = planSync(c({ active: false }), [{ id: "t5", n: 5, status: "paid" }, { id: "t6", n: 6, status: "forecast" }, { id: "t7", n: 7, status: "forecast" }]);
    expect(p.remove).toEqual(["t6", "t7"]);
    expect(p.create).toHaveLength(0);
  });
  it("rodar de novo sem mudanças não cria nada", () => {
    const all = [5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ id: `t${n}`, n, status: "forecast" }));
    const p = planSync(c(), all);
    expect(p.create).toHaveLength(0);
    expect(p.remove).toHaveLength(0);
  });
});

describe("situação do compromisso", () => {
  const txs = (paid: number[], unpaid: number[]) => [
    ...paid.map((n) => ({ n, status: "paid", amount_cents: 85000, paid_amount_cents: 85000, cash_date: dueDate("2026-07-10", n) })),
    ...unpaid.map((n) => ({ n, status: "forecast", amount_cents: 85000, paid_amount_cents: null, cash_date: dueDate("2026-07-10", n) })),
  ];
  it("parcelas pagas (inclusive as de antes), restantes, próxima e término", () => {
    const s = summarize(c(), txs([5, 6], [7, 8, 9, 10, 11, 12]), "2026-12-20");
    expect(s).toMatchObject({ paidCount: 6, remaining: 6, progress: 50, nextDue: "2027-01-10", nextCents: 85000, endDate: "2027-06-10", remainingCents: 6 * 85000, paidCents: 2 * 85000, totalCents: 12 * 85000, late: 0, state: "em_dia" });
  });
  it("atrasado quando há parcela vencida sem pagar", () => {
    const s = summarize(c(), txs([5], [6, 7, 8, 9, 10, 11, 12]), "2026-12-20");
    expect(s).toMatchObject({ late: 1, state: "atrasado", nextDue: "2026-12-10" });
  });
  it("quitado quando todas estão pagas, encerrado quando foi parado antes do fim", () => {
    expect(summarize(c(), txs([5, 6, 7, 8, 9, 10, 11, 12], []), "2027-07-01")).toMatchObject({ remaining: 0, state: "quitado", progress: 100 });
    expect(summarize(c({ active: false }), txs([5], []), "2026-12-01").state).toBe("encerrado");
  });
  it("peso por mês das parcelas ainda não pagas", () => {
    const items = txs([5], [6, 7, 8]).concat([{ n: 99, status: "forecast", amount_cents: 20000, paid_amount_cents: null, cash_date: "2026-12-25" }]);
    const m = monthlyLoad(items, "2026-11-01", 4);
    expect(m.map((x) => x.cents)).toEqual([0, 85000 + 20000, 85000, 85000]); // a de novembro (5) está paga
  });
});

describe("formulário", () => {
  const f = (o: Record<string, string> = {}) => ({
    kind: "loan", name: "Empréstimo Itaú", entity_id: ENT, institution: "Itaú", payment_method_id: "", category_id: "", installment: "850,00",
    installments: "48", paid_before: "12", next_due: "2026-12-10", contracted: "30.000,00", contemplated_on: "", notes: "", ...o,
  });
  it("converte valores, datas e campos vazios", () => {
    expect(createSchema.parse(f())).toMatchObject({ kind: "loan", installment: 85000, installments: 48, paid_before: 12, contracted: 3000000, payment_method_id: null, contemplated_on: null });
  });
  it("rejeita parcela zero, total fora do limite, já pagas >= total e data inválida", () => {
    expect(createSchema.safeParse(f({ installment: "0" })).success).toBe(false);
    expect(createSchema.safeParse(f({ installments: "0" })).success).toBe(false);
    expect(createSchema.safeParse(f({ installments: "601" })).success).toBe(false);
    expect(createSchema.safeParse(f({ paid_before: "48" })).success).toBe(false);
    expect(createSchema.safeParse(f({ next_due: "2026-02-30" })).success).toBe(false);
    expect(createSchema.safeParse(f({ kind: "outro" })).success).toBe(false);
  });
  it("valor contratado é opcional", () => {
    expect(createSchema.parse(f({ contracted: "" })).contracted).toBeNull();
  });
  it("edição não pede datas nem parcelas pagas", () => {
    expect(editSchema.parse({ name: "X Y", entity_id: ENT, institution: "", payment_method_id: "", category_id: "", installment: "900,00", installments: "50", contracted: "", contemplated_on: "2026-10-01", notes: "" }))
      .toMatchObject({ installment: 90000, installments: 50, contemplated_on: "2026-10-01" });
  });
});
