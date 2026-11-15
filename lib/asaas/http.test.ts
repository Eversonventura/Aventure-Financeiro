import { describe, expect, it, vi } from "vitest";
import { AsaasError, createAsaas } from "./http";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const pay = (id: string) => ({ id, customer: "cus_1", value: 100, status: "RECEIVED" });

describe("cliente do Asaas", () => {
  it("manda a chave no cabeçalho access_token e usa a base informada", async () => {
    const f = vi.fn().mockResolvedValue(json({ balance: 1234.56 }));
    const api = createAsaas({ apiKey: "chave-secreta", baseUrl: "https://sandbox.asaas.com/api/v3/", fetchImpl: f });
    expect(await api.getBalance()).toBe(1234.56);
    expect(f.mock.calls[0][0]).toBe("https://sandbox.asaas.com/api/v3/finance/balance");
    expect(f.mock.calls[0][1].headers.access_token).toBe("chave-secreta");
  });
  it("pagina as cobranças até acabar e filtra pelo vencimento", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ data: Array.from({ length: 100 }, (_, i) => pay(`p${i}`)), hasMore: true }))
      .mockResolvedValueOnce(json({ data: [pay("p100"), pay("p101")], hasMore: false }));
    const r = await createAsaas({ apiKey: "k", fetchImpl: f }).listPayments("2026-10-01", "2026-12-15");
    expect(r).toHaveLength(102);
    expect(f).toHaveBeenCalledTimes(2);
    const url = decodeURIComponent(f.mock.calls[0][0]);
    expect(url).toContain("dueDate[ge]=2026-10-01");
    expect(url).toContain("dueDate[le]=2026-12-15");
    expect(f.mock.calls[1][0]).toContain("offset=100");
  });
  it("ignora itens fora do formato esperado e respeita o limite", async () => {
    const f = vi.fn().mockResolvedValue(json({ data: [pay("a"), { id: "so-id" }, pay("b")], hasMore: false }));
    expect((await createAsaas({ apiKey: "k", fetchImpl: f }).listPayments("2026-10-01", "2026-12-15")).map((p) => p.id)).toEqual(["a", "b"]);
    const g = vi.fn().mockImplementation(async () => json({ data: Array.from({ length: 100 }, (_, i) => pay(`p${i}`)), hasMore: true }));
    expect(await createAsaas({ apiKey: "k", fetchImpl: g }).listPayments("2026-10-01", "2026-12-15", 150)).toHaveLength(150);
  });
  it("lista os clientes com id e nome", async () => {
    const f = vi.fn().mockResolvedValue(json({ data: [{ id: "cus_1", name: "SR Tecnologia", cpfCnpj: "123" }, { name: "sem id" }], hasMore: false }));
    expect(await createAsaas({ apiKey: "k", fetchImpl: f }).listCustomers()).toEqual([{ id: "cus_1", name: "SR Tecnologia", cpfCnpj: "123" }]);
  });
  it("erros: 401 com mensagem clara, mensagem do Asaas e falta de resposta", async () => {
    const mk = (r: () => Promise<Response>) => createAsaas({ apiKey: "k", fetchImpl: vi.fn().mockImplementation(r) });
    await expect(mk(async () => json({}, 401)).getBalance()).rejects.toThrow(/Chave do Asaas recusada/);
    await expect(mk(async () => json({ errors: [{ description: "Cobrança inválida" }] }, 400)).getBalance()).rejects.toThrow("Cobrança inválida");
    await expect(mk(async () => { throw new Error("rede"); }).getBalance()).rejects.toBeInstanceOf(AsaasError);
  });
  it("a chave nunca aparece na mensagem de erro", async () => {
    const api = createAsaas({ apiKey: "SEGREDO-123", fetchImpl: vi.fn().mockResolvedValue(json({}, 500)) });
    await expect(api.getBalance()).rejects.not.toThrow(/SEGREDO/);
  });
});
