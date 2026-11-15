"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function FaturaUpload({ cards }: { cards: { id: string; name: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [card, setCard] = useState(cards[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setMsg("Escolha o arquivo da fatura.");
    if (!card) return setMsg("Cadastre um cartão de crédito antes.");
    setState("sending");
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("payment_method_id", card);
    try {
      const res = await fetch("/api/faturas", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) { setState("error"); return setMsg(body?.error ?? "Não foi possível enviar a fatura."); }
      router.push(`/importacoes/fatura/${body.id}`);
    } catch {
      setState("error");
      setMsg("Sem conexão. Tente de novo.");
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Conferir fatura do cartão</h2>
      <p className="text-sm text-muted">Envie o PDF, CSV ou OFX da fatura. O sistema compara com o que você lançou naquele cartão e mostra só as diferenças.</p>
      <select value={card} onChange={(e) => setCard(e.target.value)} className="rounded-xl border border-line-strong bg-surface-2 p-3 text-base text-ink" aria-label="Cartão">
        {cards.length === 0 && <option value="">Nenhum cartão de crédito cadastrado</option>}
        {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input ref={input} type="file" accept=".pdf,.csv,.ofx,.txt" className="rounded-xl border border-line-strong bg-surface-2 p-3 text-sm" />
      <button disabled={state === "sending"} className="rounded-xl bg-gold px-4 py-3 font-semibold text-canvas hover:brightness-110 disabled:opacity-60">
        {state === "sending" ? "Lendo a fatura… pode levar até 1 minuto" : "Enviar e conferir"}
      </button>
      {msg && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{msg}</p>}
    </form>
  );
}
