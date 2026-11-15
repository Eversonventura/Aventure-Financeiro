import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let user: { id: string } | null = { id: "u1" };
let membership: { org_id: string } | null = { org_id: "org-1" };
let keyOk = true;
const chatLoop = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => { const q: Record<string, unknown> = {}; Object.assign(q, { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: membership }) }); return q; },
  }),
}));
vi.mock("@/lib/analista/anthropic", () => ({ hasKey: () => keyOk, chatModel: () => vi.fn() }));
vi.mock("@/lib/analista/data", () => ({ chatDeps: async () => ({}) }));
vi.mock("@/lib/analista/chat", async (orig) => ({ ...(await orig<typeof import("@/lib/analista/chat")>()), chatLoop: (...a: unknown[]) => chatLoop(...a) }));

import { POST } from "./route";

const req = (body: unknown) => new NextRequest("http://localhost/api/analista/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ask = { messages: [{ role: "user", content: "Quanto gastamos com delivery?" }] };

beforeEach(() => { user = { id: "u1" }; membership = { org_id: "org-1" }; keyOk = true; chatLoop.mockReset(); });

describe("chat do analista (rota)", () => {
  it("exige login e organização", async () => {
    user = null;
    expect((await POST(req(ask))).status).toBe(401);
    user = { id: "u1" }; membership = null;
    expect((await POST(req(ask))).status).toBe(403);
    expect(chatLoop).not.toHaveBeenCalled();
  });
  it("valida a conversa: vazia, última mensagem do assistente, texto enorme", async () => {
    expect((await POST(req({ messages: [] }))).status).toBe(400);
    expect((await POST(req({ messages: [{ role: "assistant", content: "oi" }] }))).status).toBe(400);
    expect((await POST(req({ messages: [{ role: "user", content: "a".repeat(2001) }] }))).status).toBe(400);
    expect((await POST(req("não é json"))).status).toBe(400);
  });
  it("sem chave da IA responde 503", async () => {
    keyOk = false;
    expect((await POST(req(ask))).status).toBe(503);
  });
  it("responde com o resultado do laço de ferramentas", async () => {
    chatLoop.mockResolvedValue({ reply: "R$ 180,00", toolsUsed: ["gasto_por_categoria"] });
    const res = await POST(req(ask));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "R$ 180,00", toolsUsed: ["gasto_por_categoria"] });
    expect(chatLoop.mock.calls[0][0].history).toEqual(ask.messages);
  });
  it("falha interna vira 502 sem vazar detalhes", async () => {
    chatLoop.mockRejectedValue(new Error("chave sk-secreta"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req(ask));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secreta");
    err.mockRestore();
  });
});
