import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushQueue, pendingCount, sendOrQueue, failedItems } from "./queue";
import { launchSchema } from "./launch";

const mk = (n: number) =>
  launchSchema.parse({
    id: `00000000-0000-4000-8000-00000000000${n}`, type: "expense", description: `Item ${n}`, amount_cents: 100 * n,
    date: "2026-11-10", payment_method_id: "30000000-0000-4000-8000-000000000001", entity_id: "20000000-0000-4000-8000-00000000000a",
  });
const resp = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

beforeEach(async () => {
  // fila limpa entre os testes
  const { default: Dexie } = await import("dexie");
  await Dexie.delete("caixa");
});

describe("fila offline", () => {
  it("envia direto quando há internet", async () => {
    const f = vi.fn().mockImplementation(async () => resp(200, { ok: true }));
    expect(await sendOrQueue(mk(1), f)).toEqual({ kind: "sent" });
    expect(await pendingCount()).toBe(0);
  });
  it("sem internet, guarda na fila e depois envia em ordem", async () => {
    const off = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await sendOrQueue(mk(1), off)).toMatchObject({ kind: "queued", reason: "offline" });
    expect(await sendOrQueue(mk(2), off)).toMatchObject({ kind: "queued" });
    expect(await pendingCount()).toBe(2);

    const on = vi.fn().mockImplementation(async () => resp(200));
    expect(await flushQueue(on)).toEqual({ sent: 2, failed: 0, pending: 0 });
    const ids = on.mock.calls.map((c) => JSON.parse(c[1].body).id);
    expect(ids).toEqual([mk(1).id, mk(2).id]);
  });
  it("para no primeiro erro de rede e mantém o resto", async () => {
    const off = vi.fn().mockRejectedValue(new TypeError("offline"));
    await sendOrQueue(mk(1), off);
    await sendOrQueue(mk(2), off);
    expect(await flushQueue(off)).toEqual({ sent: 0, failed: 0, pending: 2 });
  });
  it("sessão expirada (401) mantém na fila", async () => {
    const f = vi.fn().mockImplementation(async () => resp(401));
    expect(await sendOrQueue(mk(1), f)).toMatchObject({ kind: "queued", reason: "session" });
    expect(await pendingCount()).toBe(1);
  });
  it("recusa do servidor (400) não entra na fila de pendentes e fica como falha ao reenviar", async () => {
    const bad = vi.fn().mockImplementation(async () => resp(400, { error: "Cartão sem fechamento." }));
    expect(await sendOrQueue(mk(1), bad)).toEqual({ kind: "rejected", error: "Cartão sem fechamento." });
    expect(await pendingCount()).toBe(0);

    const off = vi.fn().mockRejectedValue(new TypeError("offline"));
    await sendOrQueue(mk(2), off);
    expect(await flushQueue(bad)).toEqual({ sent: 0, failed: 1, pending: 0 });
    expect((await failedItems())[0]).toMatchObject({ id: mk(2).id, error: "Cartão sem fechamento." });
  });
});
