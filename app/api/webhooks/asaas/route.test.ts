import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const processWebhook = vi.fn();
vi.mock("@/lib/asaas/process", () => ({ processWebhook: (...a: unknown[]) => processWebhook(...a) }));
vi.mock("@/lib/asaas/org", () => ({ resolveOrgId: async () => "org-1" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { POST } from "./route";

const TOKEN = "token-do-webhook-com-bastante-tamanho";
const body = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", customer: "cus_1", value: 100 } };
const req = (o: { token?: string | null; body?: unknown; raw?: string } = {}) =>
  new NextRequest("http://localhost/api/webhooks/asaas", {
    method: "POST", body: o.raw ?? JSON.stringify(o.body ?? body),
    headers: o.token === null ? {} : { "asaas-access-token": o.token ?? TOKEN, "content-type": "application/json" },
  });

beforeEach(() => { processWebhook.mockReset(); process.env.ASAAS_WEBHOOK_TOKEN = TOKEN; });

describe("webhook do Asaas (rota)", () => {
  it("recusa sem token, com token errado e sem token configurado", async () => {
    expect((await POST(req({ token: null }))).status).toBe(401);
    expect((await POST(req({ token: "errado" }))).status).toBe(401);
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    expect((await POST(req({ token: "undefined" }))).status).toBe(401);
    expect(processWebhook).not.toHaveBeenCalled();
  });
  it("com o token certo processa o evento", async () => {
    processWebhook.mockResolvedValue({ duplicate: false, result: "done", detail: "ok" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: "done" });
    expect(processWebhook.mock.calls[0][2]).toMatchObject({ id: "evt_1", event: "PAYMENT_RECEIVED" });
    expect(processWebhook.mock.calls[0][1]).toMatchObject({ orgId: "org-1", userId: null });
  });
  it("evento repetido devolve 200 (o Asaas não precisa reenviar)", async () => {
    processWebhook.mockResolvedValue({ duplicate: true, result: "done", detail: "evento já processado" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
  });
  it("JSON inválido é 400; formato desconhecido é 200 e não processa", async () => {
    expect((await POST(req({ raw: "{nao-json" }))).status).toBe(400);
    const res = await POST(req({ body: { qualquer: "coisa" } }));
    expect(res.status).toBe(200);
    expect(processWebhook).not.toHaveBeenCalled();
  });
  it("erro interno devolve 500 (o Asaas tenta de novo) sem vazar detalhes", async () => {
    processWebhook.mockRejectedValue(new Error("senha do banco"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("senha");
    err.mockRestore();
  });
  it("corpo gigante é recusado", async () => {
    expect((await POST(req({ raw: "x".repeat(300 * 1024) }))).status).toBe(413);
  });
});
