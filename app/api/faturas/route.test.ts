import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const CARD = "30000000-0000-4000-8000-000000000001";
let user: { id: string } | null;
let role: string;
let cardKind: string | null;
let keyOk: boolean;
const updates: { table: string; patch: Record<string, unknown> }[] = [];
const uploads: string[] = [];
const pdfRead = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    storage: { from: () => ({ upload: async (p: string) => { uploads.push(p); return { error: null }; } }) },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, eq: () => q, limit: () => q, insert: async () => ({ error: null }),
        update: (patch: Record<string, unknown>) => { updates.push({ table, patch }); return { eq: async () => ({ error: null }) }; },
        maybeSingle: async () => ({ data: table === "memberships" ? { org_id: "org-1", role } : table === "payment_methods" ? (cardKind ? { id: CARD, kind: cardKind, closing_day: 13, due_day: 20 } : null) : null }),
      });
      return q;
    },
  }),
}));
vi.mock("@/lib/sheet/anthropic", () => ({ hasAnthropicKey: () => keyOk }));
vi.mock("@/lib/fatura/anthropic", () => ({ sonnetReadInvoicePdf: (...a: unknown[]) => pdfRead(...a) }));

import { POST } from "./route";

const csv = "date,title,amount\n2026-11-05,Cometa,128.90\n2026-11-08,Uber,27.90\n";
const req = (file: File | null, card: string | null = CARD) => {
  const fd = new FormData();
  if (file) fd.append("file", file);
  if (card) fd.append("payment_method_id", card);
  return new NextRequest("http://localhost/api/faturas", { method: "POST", body: fd });
};
const pdfFile = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], "fatura.pdf", { type: "application/pdf" });

beforeEach(() => { user = { id: "u1" }; role = "owner"; cardKind = "credit_card"; keyOk = true; updates.length = 0; uploads.length = 0; pdfRead.mockReset(); });

describe("envio da fatura (rota)", () => {
  it("exige login e permissão de escrita", async () => {
    user = null;
    expect((await POST(req(new File([csv], "f.csv")))).status).toBe(401);
    user = { id: "u1" }; role = "viewer";
    expect((await POST(req(new File([csv], "f.csv")))).status).toBe(403);
  });
  it("valida arquivo, cartão e formato", async () => {
    expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req(new File([csv], "f.csv"), null))).status).toBe(400);
    cardKind = "bank_account";
    expect((await POST(req(new File([csv], "f.csv")))).status).toBe(400); // não é cartão de crédito
    cardKind = "credit_card";
    expect((await POST(req(new File(["x"], "foto.png")))).status).toBe(400);
    expect((await POST(req(new File([new Uint8Array(5 * 1024 * 1024)], "grande.csv")))).status).toBe(400);
  });
  it("CSV: guarda o arquivo, lê as linhas e já sugere o mês da fatura pelo fechamento do cartão", async () => {
    const res = await POST(req(new File([csv], "nubank.csv")));
    expect(await res.json()).toMatchObject({ status: "ready" });
    expect(uploads[0]).toMatch(/^org-1\/.+\.csv$/);
    const ready = updates.find((u) => u.patch.status === "ready")!.patch as { layout: { month: string; lines: unknown[]; card_id: string } };
    expect(ready.layout.lines).toHaveLength(2);
    expect(ready.layout).toMatchObject({ card_id: CARD, month: "2026-11" }); // compra dia 8, fecha dia 13 -> vence 20/11
  });
  it("OFX: reconhece pelo conteúdo", async () => {
    const ofx = "OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>20261105<TRNAMT>-10.00<MEMO>LOJA</STMTTRN></OFX>";
    const res = await POST(req(new File([ofx], "extrato.txt")));
    expect(await res.json()).toMatchObject({ status: "ready" });
    expect(uploads[0]).toMatch(/\.ofx$/);
  });
  it("PDF: o Claude lê; sem a chave, falha com mensagem clara e o arquivo fica guardado", async () => {
    keyOk = false;
    expect(await (await POST(req(pdfFile()))).json()).toMatchObject({ status: "failed" });
    expect((updates.find((u) => u.patch.status === "failed")!.patch.stats as { error: string }).error).toContain("ANTHROPIC_API_KEY");
    expect(pdfRead).not.toHaveBeenCalled();
    keyOk = true; updates.length = 0;
    pdfRead.mockResolvedValue(JSON.stringify({ due_date: "2026-11-20", lines: [{ date: "2026-11-05", description: "COMETA", amount: 128.9 }] }));
    expect(await (await POST(req(pdfFile()))).json()).toMatchObject({ status: "ready" });
    expect((updates.find((u) => u.patch.status === "ready")!.patch as { layout: { month: string } }).layout.month).toBe("2026-11");
  });
  it("arquivo sem compras ou resposta ruim da IA vira falha, sem vazar detalhes", async () => {
    expect(await (await POST(req(new File(["date,title,amount\n"], "vazio.csv")))).json()).toMatchObject({ status: "failed" });
    pdfRead.mockResolvedValue("não consegui");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await POST(req(pdfFile()));
    expect(await r.json()).toMatchObject({ status: "failed" });
    expect(JSON.stringify(updates)).not.toContain("não consegui");
    err.mockRestore();
  });
});
