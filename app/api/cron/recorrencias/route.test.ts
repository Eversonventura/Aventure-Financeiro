import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generateMonth = vi.fn();
vi.mock("@/lib/generate", () => ({ generateMonth: (...a: unknown[]) => generateMonth(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { GET } from "./route";

const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/recorrencias", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  generateMonth.mockReset();
  process.env.CRON_SECRET = "segredo-de-teste-com-32-caracteres!";
});

describe("cron de recorrências", () => {
  it("recusa sem token, com token errado e sem CRON_SECRET configurado", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer errado"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect(generateMonth).not.toHaveBeenCalled();
  });
  it("com o token certo gera o mês corrente (dia 1)", async () => {
    generateMonth.mockResolvedValue({ rules: 3, generated: 3, created: 3, skipped: 0 });
    const res = await GET(req("Bearer segredo-de-teste-com-32-caracteres!"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rules: 3, created: 3 });
    expect(generateMonth.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-01$/);
  });
  it("erro interno não vaza detalhes", async () => {
    generateMonth.mockRejectedValue(new Error("senha do banco"));
    const res = await GET(req("Bearer segredo-de-teste-com-32-caracteres!"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("senha");
  });
});
