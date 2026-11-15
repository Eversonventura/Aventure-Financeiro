"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGESTOES = [
  "Qual foi o lucro líquido do mês passado?",
  "Quanto gastamos com delivery no mês passado?",
  "Como está o caixa dos próximos 3 meses?",
  "Quais foram os 5 maiores gastos do mês passado?",
];

/** Chat com os dados: a IA consulta pelas ferramentas de leitura e responde com números. */
export function AnalistaChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  async function send(q: string) {
    const content = q.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setText("");
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/analista/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.slice(-10) }) });
      const body = (await res.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!res.ok || !body?.reply) setError(body?.error ?? "Não consegui responder agora.");
      else setMsgs([...next, { role: "assistant", content: body.reply }]);
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Pergunte aos seus dados</h2>
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button key={s} onClick={() => void send(s)} className="rounded-full border border-line-strong bg-surface-2 px-3 py-2 text-left text-sm">{s}</button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "self-end bg-brand text-white" : "self-start bg-surface-2"}`}>{m.content}</div>
        ))}
        {busy && <div className="self-start rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">Consultando os dados…</div>}
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: quanto gastamos com combustível em outubro?" maxLength={500}
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-base text-ink" />
        <button disabled={busy || text.trim().length === 0} className="rounded-xl bg-gold px-5 font-semibold text-canvas disabled:opacity-50">Enviar</button>
      </form>
      <p className="text-xs text-muted">As respostas vêm dos seus lançamentos, mas podem errar: confira números importantes no DRE e em Lançamentos.</p>
    </section>
  );
}
