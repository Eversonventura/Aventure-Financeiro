import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generate = vi.fn();
let existing: string[] = [];
let hasKeyFlag = true;
vi.mock("@/lib/analista/data", () => ({ generateMonthlyReport: (...a: unknown[]) => generate(...a) }));
vi.mock("@/lib/analista/anthropic", () => ({ hasKey: () => hasKeyFlag, opusText: vi.fn(), opusModel: () => "claude-opus-5-5" }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      if (t === "organizations") return { select: async () => ({ data: [{ id: "org-a" }, { id: "org-b" }] }) };
      const q: Record<string, unknown> = {};
      let org = "";
      Object.assign(q, { select: () => q, eq: (c: string, v: string) => { if (c === "org_id") org = v; return q; }, limit: () => q, maybeSingle: async () => ({ data: existing.includes(org) ? { id: "x" } : null }) });
      return q;
    },
  }),
}));

import { GET } from "./route";

const req = (auth?: string) => new NextRequest("http://localhost/api/cron/analista", { headers: auth ? { authorization: auth } : {} });
const SECRET = "segredo-do-cron-com-bastante-tamanho";

beforeEach(() => { generate.mockReset(); existing = []; hasKeyFlag = true; process.env.CRON_SECRET = SECRET; });

describe("cron do analista (dia 1)", () => {
  it("recusa sem token, com token errado e sem CRON_SECRET", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer errado"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });
  it("sem chave da IA, não faz nada", async () => {
    hasKeyFlag = false;
    expect(await (await GET(req(`Bearer ${SECRET}`))).json()).toMatchObject({ skipped: expect.any(String) });
    expect(generate).not.toHaveBeenCalled();
  });
  it("gera o relatório do mês anterior só para quem ainda não tem", async () => {
    existing = ["org-a"];
    generate.mockResolvedValue({});
    const j = await (await GET(req(`Bearer ${SECRET}`))).json();
    expect(j.results).toEqual([{ org: "org-a", status: "já existe" }, { org: "org-b", status: "gerado" }]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toBe("org-b");
    expect(generate.mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-01$/); // dia 1 do mês anterior
  });
  it("erro em uma organização não impede as outras e não vaza detalhes", async () => {
    generate.mockRejectedValueOnce(new Error("senha do banco")).mockResolvedValueOnce({});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const j = await (await GET(req(`Bearer ${SECRET}`))).json();
    expect(j.results.map((r: { status: string }) => r.status)).toEqual(["erro", "gerado"]);
    expect(JSON.stringify(j)).not.toContain("senha");
    err.mockRestore();
  });
});
