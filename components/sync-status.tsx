"use client";

import { useCallback, useEffect, useState } from "react";
import { discardItem, failedItems, flushQueue, pendingCount, type QueueItem } from "@/lib/queue";
import { centsToBRL } from "@/lib/format";

/** Mostra lançamentos guardados no aparelho e tenta enviá-los quando a conexão volta. */
export function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<QueueItem[]>([]);

  const refresh = useCallback(async () => {
    setPending(await pendingCount());
    setFailed(await failedItems());
  }, []);

  useEffect(() => {
    const tentar = () => { void flushQueue().then(refresh); };
    tentar();
    window.addEventListener("online", tentar);
    window.addEventListener("caixa-queue-changed", refresh);
    const t = setInterval(tentar, 60_000);
    return () => {
      window.removeEventListener("online", tentar);
      window.removeEventListener("caixa-queue-changed", refresh);
      clearInterval(t);
    };
  }, [refresh]);

  if (pending === 0 && failed.length === 0) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-20 flex flex-col gap-1 bg-amber-50 p-2 text-sm text-amber-900">
      {pending > 0 && (
        <button className="text-left" onClick={() => void flushQueue().then(refresh)}>
          {pending} lançamento(s) aguardando envio. Toque para tentar agora.
        </button>
      )}
      {failed.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 text-red-700">
          <span>Recusado: {f.payload.description} {centsToBRL(f.payload.amount_cents)} — {f.error}</span>
          <button className="underline" onClick={() => void discardItem(f.id).then(refresh)}>Descartar</button>
        </div>
      ))}
    </div>
  );
}
