import Dexie, { type Table } from "dexie";
import type { LaunchInput } from "@/lib/launch";

// Fila local de lançamentos (IndexedDB): permite lançar sem internet e enviar depois.

export type QueueItem = {
  id: string; // = id do lançamento
  payload: LaunchInput;
  createdAt: number;
  status: "pending" | "failed";
  error?: string;
};

class CaixaDB extends Dexie {
  queue!: Table<QueueItem, string>;
  constructor() {
    super("caixa");
    this.version(1).stores({ queue: "id, status, createdAt" });
  }
}

let _db: CaixaDB | null = null;
const db = () => (_db ??= new CaixaDB());

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("caixa-queue-changed"));
}

export type SendResult =
  | { kind: "sent" }
  | { kind: "queued"; reason: "offline" | "session" | "server" }
  | { kind: "rejected"; error: string };

type FetchLike = typeof fetch;

async function post(payload: LaunchInput, fetchImpl: FetchLike): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/lancamentos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { kind: "queued", reason: "offline" };
  }
  if (res.ok) return { kind: "sent" };
  if (res.status === 401) return { kind: "queued", reason: "session" };
  if (res.status >= 400 && res.status < 500) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { kind: "rejected", error: body?.error ?? "Lançamento recusado." };
  }
  return { kind: "queued", reason: "server" };
}

/** Tenta enviar na hora; se não der (sem internet, sessão, erro do servidor), guarda na fila. */
export async function sendOrQueue(payload: LaunchInput, fetchImpl: FetchLike = fetch): Promise<SendResult> {
  const r = await post(payload, fetchImpl);
  if (r.kind === "queued") {
    await db().queue.put({ id: payload.id, payload, createdAt: Date.now(), status: "pending" });
    notify();
  }
  return r;
}

let flushing = false;

/** Envia a fila em ordem. Para no primeiro erro de rede/sessão; recusas viram "failed". */
export async function flushQueue(fetchImpl: FetchLike = fetch): Promise<{ sent: number; failed: number; pending: number }> {
  if (flushing) return { sent: 0, failed: 0, pending: await pendingCount() };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const items = await db().queue.where("status").equals("pending").sortBy("createdAt");
    for (const item of items) {
      const r = await post(item.payload, fetchImpl);
      if (r.kind === "sent") {
        await db().queue.delete(item.id);
        sent++;
      } else if (r.kind === "rejected") {
        await db().queue.update(item.id, { status: "failed", error: r.error });
        failed++;
      } else {
        break;
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { sent, failed, pending: await pendingCount() };
}

export async function pendingCount(): Promise<number> {
  return db().queue.where("status").equals("pending").count();
}
export async function failedItems(): Promise<QueueItem[]> {
  return db().queue.where("status").equals("failed").toArray();
}
export async function discardItem(id: string): Promise<void> {
  await db().queue.delete(id);
  notify();
}
