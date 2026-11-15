"use client";

import { useState, useTransition } from "react";
import { resolveReview } from "@/app/(app)/revisao/actions";
import { fitsEntity } from "@/lib/categories";
import { centsToBRL } from "@/lib/format";

export type DeckGroup = {
  key: string; description: string; type: "expense" | "income"; ids: string[]; count: number; totalCents: number;
  method: string | null; ruleText: string; firstDate: string; confidence: number | null;
  suggestion: { entity_id: string | null; category_id: string | null; question: string | null; source: string } | null;
};
type Entity = { id: string; name: string; kind: "pj" | "pf" | "shared" };
type Category = { id: string; name: string; applies_to: "pj" | "pf" | "shared" | null; direction: "in" | "out" };

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function ReviewDeck({ initial, entities, categories }: { initial: DeckGroup[]; entities: Entity[]; categories: Category[] }) {
  const [groups, setGroups] = useState(initial);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [ruleText, setRuleText] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const queue = [...groups.filter((g) => !skipped.includes(g.key)), ...groups.filter((g) => skipped.includes(g.key))];
  const g = queue[0];
  const total = groups.reduce((s, x) => s + x.count, 0);

  if (!g) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <div className="font-heading text-2xl font-bold">Tudo revisado</div>
        <p className="mt-2 text-muted">Nenhum lançamento aguardando revisão.</p>
        {msg && <p className="mt-3 text-sm text-emerald-300">{msg.text}</p>}
      </div>
    );
  }

  const sug = g.suggestion;
  const ent = entities.find((e) => e.id === entityId);
  const cats = categories.filter((c) => c.direction === (g.type === "income" ? "in" : "out") && fitsEntity(c.applies_to, ent?.kind));
  const text = ruleText ?? g.ruleText;

  const pickEntity = (id: string) => {
    setEntityId(id);
    // a categoria sugerida já vem marcada se valer para a entidade escolhida
    const sc = categories.find((c) => c.id === sug?.category_id);
    const e = entities.find((x) => x.id === id);
    setCategoryId(sc && fitsEntity(sc.applies_to, e?.kind) ? sc.id : null);
  };

  const reset = () => { setEntityId(null); setCategoryId(null); setRuleText(null); setMsg(null); };

  const confirm = () => {
    if (!entityId) return;
    start(async () => {
      const r = await resolveReview({ ids: g.ids, entity_id: entityId, category_id: categoryId, remember, matchText: text });
      if (!r.ok) return setMsg({ tone: "erro", text: r.error });
      const done = new Set(r.resolved);
      setGroups((cur) => cur.filter((x) => !x.ids.every((i) => done.has(i))));
      reset();
      const extra = r.resolved.length - g.ids.length;
      setMsg({ tone: "ok", text: `Salvo${r.ruleCreated ? ` · regra criada${extra > 0 ? `, mais ${extra} resolvido(s)` : ""}` : ""}` });
    });
  };

  const sugEntity = entities.find((e) => e.id === sug?.entity_id);
  const sugCategory = categories.find((c) => c.id === sug?.category_id);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{total} lançamento(s) · {groups.length} pergunta(s)</span>
        <span>{queue.length > 1 ? `+${queue.length - 1} na fila` : "última"}</span>
      </div>

      {msg && <p role={msg.tone === "erro" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${msg.tone === "ok" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg.text}</p>}

      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="text-sm text-muted">{g.type === "income" ? "Entrada" : "Saída"} · {g.method ?? "sem meio"} · {dataBR(g.firstDate)}</div>
        <div className="mt-1 font-heading text-2xl leading-tight font-bold break-words">{g.description}</div>
        <div className="mt-2 text-lg">{centsToBRL(g.totalCents)}{g.count > 1 && <span className="ml-2 text-sm text-muted">{g.count} lançamentos parecidos</span>}</div>

        {(sugEntity || sugCategory) && (
          <div className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">
            {sug?.question ?? "A IA ficou na dúvida."}
            <div className="mt-1 text-amber-300">Sugestão: {[sugEntity?.name, sugCategory?.name].filter(Boolean).join(" · ")}{g.confidence != null ? ` (${Math.round(g.confidence * 100)}%)` : ""}</div>
          </div>
        )}

        <div className="mt-5 text-sm font-medium">De quem é {g.type === "income" ? "esta entrada" : "este gasto"}?</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {entities.map((e) => (
            <button key={e.id} onClick={() => pickEntity(e.id)} aria-pressed={entityId === e.id}
              className={`rounded-2xl border px-4 py-5 text-lg font-semibold ${entityId === e.id ? "border-brand bg-brand text-white" : "border-line-strong bg-surface-2"} ${sug?.entity_id === e.id && entityId !== e.id ? "ring-2 ring-gold" : ""}`}>
              {e.name}
            </button>
          ))}
        </div>

        {entityId && (
          <>
            <div className="mt-5 text-sm font-medium">Categoria <span className="font-normal text-muted">(opcional)</span></div>
            <div className="mt-2 flex flex-wrap gap-2">
              {cats.map((c) => (
                <button key={c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)} aria-pressed={categoryId === c.id}
                  className={`rounded-full border px-4 py-2.5 text-sm ${categoryId === c.id ? "border-brand bg-brand text-white" : "border-line-strong bg-surface-2"}`}>
                  {c.name}
                </button>
              ))}
              {cats.length === 0 && <span className="text-sm text-muted">Nenhuma categoria para esta entidade.</span>}
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 size-5" />
              <span className="flex-1">
                Lembrar: sempre que aparecer
                <input value={text} onChange={(e) => setRuleText(e.target.value)} disabled={!remember} aria-label="Texto da regra"
                  className="mx-1 w-40 rounded-md border border-line-strong bg-surface px-2 py-1 text-ink" />
                {ent ? <>é <strong>{ent.name}</strong></> : null}
              </span>
            </label>

            <button onClick={confirm} disabled={pending} className="mt-4 w-full rounded-2xl bg-gold py-4 text-lg font-semibold text-canvas hover:brightness-110 disabled:opacity-60">
              {pending ? "Salvando…" : g.count > 1 ? `Confirmar ${g.count} lançamentos` : "Confirmar"}
            </button>
          </>
        )}
      </div>

      {queue.length > 1 && (
        <button onClick={() => { setSkipped((s) => [...s.filter((k) => k !== g.key), g.key]); reset(); }} className="text-sm text-muted underline">Pular por enquanto</button>
      )}
    </div>
  );
}
