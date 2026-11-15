"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ImportUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) return setMsg("Escolha o arquivo .xlsx.");
    setState("sending");
    setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/importacoes", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        setState("error");
        return setMsg(body?.error ?? "Não foi possível enviar a planilha.");
      }
      router.push(`/importacoes/${body.id}`);
    } catch {
      setState("error");
      setMsg("Sem conexão. Tente de novo.");
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Importar planilha</h2>
      <p className="text-sm text-muted">
        Envie o .xlsx (no Google Sheets: Arquivo → Fazer download → Microsoft Excel). O Claude lê o layout e você confere o mapa antes de importar.
      </p>
      <input ref={input} type="file" accept=".xlsx" className="rounded-xl border border-line-strong bg-surface-2 p-3 text-sm" />
      <button disabled={state === "sending"} className="rounded-xl bg-gold px-4 py-3 font-semibold text-canvas hover:brightness-110 disabled:opacity-60">
        {state === "sending" ? "Lendo a planilha… pode levar até 1 minuto" : "Enviar e ler o layout"}
      </button>
      {msg && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{msg}</p>}
    </form>
  );
}
