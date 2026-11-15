import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "@/lib/asaas/fake-db.test-helper";

const ORG = "10000000-0000-4000-8000-00000000000a";
const U = "00000000-0000-4000-8000-0000000000u1".replace("u1", "01");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ENT = ID(100), ITAU = ID(201), SEMDIAS = ID(202), PIX = ID(203), PIX2 = ID(204), CLI = ID(300), CAT = ID(400);
const UNIQUE = { transactions: [["org_id", "source", "external_id"]], installment_groups: [["id"]] };

let user: { id: string } | null;
let f: ReturnType<typeof fakeSupabase>;
const classify = vi.fn();

const seed = (role = "owner") => ({
  memberships: [{ org_id: ORG, user_id: U, role }],
  payment_methods: [
    { id: ITAU, kind: "credit_card", closing_day: 13, due_day: 20 }, { id: SEMDIAS, kind: "credit_card", closing_day: null, due_day: null },
    { id: PIX, kind: "pix", closing_day: null, due_day: null }, { id: PIX2, kind: "bank_account", closing_day: null, due_day: null },
  ],
  transactions: [] as Record<string, unknown>[], installment_groups: [] as Record<string, unknown>[],
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: (t: string) => f.client.from(t) }) }));
vi.mock("@/lib/classify/server", () => ({ classifyLaunch: (...a: unknown[]) => classify(...a) }));

import { POST } from "./route";

const body = (o: Record<string, unknown> = {}) => ({
  id: ID(1), type: "expense", description: "Cometa", amount_cents: 4500, date: "2026-11-10", installments: 1, payment_method_id: ITAU,
  entity_id: ENT, person_id: null, category_id: CAT, ...o,
});
const post = (o: Record<string, unknown> = {}, raw?: string) =>
  POST(new NextRequest("http://localhost/api/lancamentos", { method: "POST", body: raw ?? JSON.stringify(body(o)), headers: { "content-type": "application/json" } }));

beforeEach(() => { user = { id: U }; f = fakeSupabase(seed(), UNIQUE); classify.mockReset().mockResolvedValue(null); });

describe("endpoint de lançamento", () => {
  it("exige login, permissão de escrita e corpo válido", async () => {
    user = null;
    expect((await post()).status).toBe(401);
    user = { id: U }; f = fakeSupabase(seed("viewer"), UNIQUE);
    expect((await post()).status).toBe(403);
    f = fakeSupabase(seed(), UNIQUE);
    expect((await post({}, "não é json")).status).toBe(400);
    expect((await post({ amount_cents: 0 })).status).toBe(400);
    expect((await post({ date: "2026-02-30" })).status).toBe(400);
    expect(f.db.transactions).toHaveLength(0);
  });

  it("compra à vista no cartão: fatura certa, pendente, da organização do usuário", async () => {
    expect((await post()).status).toBe(200);
    expect(f.db.transactions).toHaveLength(1);
    expect(f.db.transactions[0]).toMatchObject({ org_id: ORG, created_by: U, status: "pending", invoice_month: "2026-11-01", cash_date: "2026-11-20", category_id: CAT, source: "manual" });
  });

  it("3x no cartão: um grupo e uma linha por parcela, cada uma na sua fatura", async () => {
    await post({ installments: 3, date: "2026-11-14" });
    expect(f.db.installment_groups).toHaveLength(1);
    expect(f.db.installment_groups[0]).toMatchObject({ org_id: ORG, installments: 3, first_invoice_month: "2026-12-01" });
    expect(f.db.transactions.map((t) => t.invoice_month)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(f.db.transactions.reduce((s, t) => s + (t.amount_cents as number), 0)).toBe(4500);
  });

  it("reenviar o mesmo lançamento (fila offline) não duplica", async () => {
    await post({ installments: 3 });
    await post({ installments: 3 });
    await post({ installments: 3 });
    expect(f.db.transactions).toHaveLength(3);
    expect(f.db.installment_groups).toHaveLength(1);
  });

  it("pix sai no dia e já fica pago", async () => {
    await post({ payment_method_id: PIX });
    expect(f.db.transactions[0]).toMatchObject({ status: "paid", paid_amount_cents: 4500, cash_date: "2026-11-10", invoice_month: null });
  });

  it("entrada leva o cliente", async () => {
    await post({ type: "income", payment_method_id: PIX2, client_id: CLI });
    expect(f.db.transactions[0]).toMatchObject({ type: "income", client_id: CLI });
  });

  it("transferência cria as duas pernas", async () => {
    await post({ type: "transfer", description: "Asaas para Nubank", amount_cents: 100000, payment_method_id: PIX2, to_payment_method_id: PIX, category_id: null });
    expect(f.db.transactions).toHaveLength(2);
    expect(f.db.transactions.map((t) => t.payment_method_id)).toEqual([PIX2, PIX]);
  });

  it("recusa: cartão sem fechamento, meio inexistente e parcelar fora do cartão", async () => {
    const a = await post({ payment_method_id: SEMDIAS });
    expect(a.status).toBe(400);
    expect((await a.json()).error).toContain("fechamento");
    expect((await post({ payment_method_id: ID(999) })).status).toBe(400);
    expect((await post({ payment_method_id: PIX, installments: 3 })).status).toBe(400);
    expect(f.db.transactions).toHaveLength(0);
  });

  it("a foto do cupom só vale se estiver na pasta da própria organização", async () => {
    const outra = `${ID(777)}/${ID(778)}.jpg`;
    expect((await post({ receipt_path: outra })).status).toBe(400);
    const minha = `${ORG}/${ID(778)}.jpg`;
    expect((await post({ receipt_path: minha })).status).toBe(200);
    expect(f.db.transactions[0].receipt_path).toBe(minha);
  });

  it("sem categoria, usa a classificação (confiança alta entra direto; baixa vai para a revisão com a sugestão)", async () => {
    classify.mockResolvedValue({ category_id: CAT, person_id: null, needs_review: false, ai_confidence: 0.95, ai_suggestion: null });
    await post({ category_id: null });
    expect(f.db.transactions[0]).toMatchObject({ category_id: CAT, needs_review: false, ai_confidence: 0.95 });
    f = fakeSupabase(seed(), UNIQUE);
    classify.mockResolvedValue({ category_id: null, person_id: null, needs_review: true, ai_confidence: 0.5, ai_suggestion: { entity_id: ENT, category_id: CAT, person_id: null, question: "?", source: "ai" } });
    await post({ category_id: null });
    expect(f.db.transactions[0]).toMatchObject({ category_id: null, needs_review: true, ai_suggestion: { question: "?" } });
  });

  it("falha na classificação não impede de salvar; vai para a revisão", async () => {
    classify.mockRejectedValue(new Error("IA fora do ar"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ category_id: null })).status).toBe(200);
    expect(f.db.transactions[0]).toMatchObject({ category_id: null, needs_review: true });
    err.mockRestore();
  });

  it("erro do banco devolve 500 (o celular mantém na fila e tenta depois)", async () => {
    f.failNext("transactions", "upsert");
    expect((await post()).status).toBe(500);
  });
});
