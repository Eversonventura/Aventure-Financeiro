"use client";

import { useRef, useState } from "react";
import { centsToBRL, centsToInput } from "@/lib/format";
import { markPaid, undoPaid } from "@/app/(app)/contas/actions";

export type ContaView = {
  id: string; description: string; amount_cents: number; paid_amount_cents: number | null;
  due: string; kind: "pagar" | "receber"; paid: boolean; label: string; tone: "ok" | "warn" | "late" | "plain"; sub: string;
};

const TONE = {
  ok: "bg-green-50 text-green-700", warn: "bg-amber-50 text-amber-800",
  late: "bg-red-50 text-red-700", plain: "bg-zinc-100 text-zinc-600",
} as const;

/** Linha de conta: deslizar para a direita (ou tocar no botão) abre o "marcar como pago". */
export function ContaRow({ c, mes }: { c: ContaView; mes: string }) {
  const [open, setOpen] = useState(false);
  const x0 = useRef<number | null>(null);
  const dd = c.due.slice(8, 10), mm = c.due.slice(5, 7);

  return (
    <li
      className="rounded-xl border border-zinc-200 bg-white p-3"
      onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (x0.current != null && !c.paid && e.changedTouches[0].clientX - x0.current > 80) setOpen(true);
        x0.current = null;
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{c.description}</div>
          <div className="text-sm text-zinc-500">vence {dd}/{mm} · {c.sub}</div>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${TONE[c.tone]}`}>{c.label}</span>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-semibold ${c.kind === "receber" ? "text-green-700" : ""}`}>
            {centsToBRL(c.paid ? c.paid_amount_cents ?? c.amount_cents : c.amount_cents)}
          </div>
          {c.paid && c.paid_amount_cents != null && c.paid_amount_cents !== c.amount_cents && (
            <div className="text-xs text-zinc-400">previsto {centsToBRL(c.amount_cents)}</div>
          )}
        </div>
      </div>

      {c.paid ? (
        <form action={undoPaid} className="mt-1 text-right">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="mes" value={mes} />
          <button className="text-xs text-zinc-500 underline">Desfazer</button>
        </form>
      ) : open ? (
        <form action={markPaid} className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="mes" value={mes} />
          <label className="flex flex-col gap-1 text-sm">
            Valor real (R$) — deixe como está se foi o previsto
            <input name="valor" defaultValue={centsToInput(c.amount_cents)} inputMode="decimal" autoFocus
              className="rounded-lg border border-zinc-300 px-3 py-2.5 text-base" />
          </label>
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-white">{c.kind === "receber" ? "Marcar como recebido" : "Marcar como pago"}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-300 px-4">Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-sm underline">
          {c.kind === "receber" ? "Marcar como recebido" : "Marcar como pago"}
        </button>
      )}
    </li>
  );
}
