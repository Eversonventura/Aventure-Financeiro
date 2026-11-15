"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { brlToCents, centsToBRL } from "@/lib/format";
import { buildLaunch, launchSchema, type MethodInfo } from "@/lib/launch";
import { fitsEntity } from "@/lib/categories";
import { sendOrQueue } from "@/lib/queue";

export type RefData = {
  entities: { id: string; name: string; kind: "pj" | "pf" | "shared" }[];
  people: { id: string; name: string; default_entity_id: string | null; isMe: boolean }[];
  methods: (MethodInfo & { name: string })[];
  categories: { id: string; name: string; applies_to: "pj" | "pf" | "shared" | null; direction: "in" | "out" }[];
};

type Kind = "expense" | "income" | "transfer";
type Suggestion = { entity_id: string | null; category_id: string | null; confidence: number; sure: boolean; source: string };
const KINDS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Saída" },
  { value: "income", label: "Entrada" },
  { value: "transfer", label: "Transferência" },
];

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
const novoId = () => crypto.randomUUID();
const lembrar = (k: string) => { try { return localStorage.getItem(`caixa:${k}`) ?? ""; } catch { return ""; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(`caixa:${k}`, v); } catch { /* sem armazenamento */ } };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-4 py-2 text-sm ${on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface-2 text-ink"}`}
    >
      {children}
    </button>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const noop = () => () => {};

/** Data, id e últimos usados dependem do aparelho: o formulário só monta no cliente. */
export function LaunchForm({ refs }: { refs: RefData }) {
  const noCliente = useSyncExternalStore(noop, () => true, () => false);
  if (!noCliente) return <p className="text-muted">Carregando…</p>;
  return <LaunchFormInner refs={refs} />;
}

function LaunchFormInner({ refs }: { refs: RefData }) {
  const me = refs.people.find((p) => p.isMe);
  const lm = lembrar("method");
  const le = lembrar("entity");
  const [type, setType] = useState<Kind>("expense");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [methodId, setMethodId] = useState(() => (refs.methods.some((m) => m.id === lm) ? lm : refs.methods[0]?.id ?? ""));
  const [toMethodId, setToMethodId] = useState("");
  const [installments, setInstallments] = useState(1);
  const [entityId, setEntityId] = useState(() => (refs.entities.some((e) => e.id === le) ? le : me?.default_entity_id ?? refs.entities[0]?.id ?? ""));
  const [personId, setPersonId] = useState(me?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(hoje);
  const [launchId, setLaunchId] = useState(novoId);
  const [msg, setMsg] = useState<{ tone: "ok" | "info" | "erro"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [entityTouched, setEntityTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [sugg, setSugg] = useState<Suggestion | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const method = refs.methods.find((m) => m.id === methodId) ?? null;
  const toMethod = refs.methods.find((m) => m.id === toMethodId) ?? null;
  const entity = refs.entities.find((e) => e.id === entityId);
  const isCard = type === "expense" && method?.kind === "credit_card";

  const categories = refs.categories.filter(
    (c) => c.direction === (type === "income" ? "in" : "out") && fitsEntity(c.applies_to, entity?.kind),
  );
  const categoryOk = categories.some((c) => c.id === categoryId);

  const cents = brlToCents(amountText);
  const amountValid = cents != null && !Number.isNaN(cents) && cents > 0;

  // sugestão de entidade e categoria (regras, histórico e IA) enquanto a pessoa digita
  const amountForSuggestion = amountValid ? cents : 0;
  useEffect(() => {
    const desc = description.trim();
    if (type === "transfer" || desc.length < 3 || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/classificar", {
          method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({ description: desc, amount_cents: amountForSuggestion, payment_method_id: methodId || null, person_id: personId || null, type }),
        });
        if (!res.ok) return;
        const s = (await res.json()) as Suggestion;
        if (s.source === "none") return setSugg(null);
        setSugg(s);
        if (!s.sure) return;
        const e = refs.entities.find((x) => x.id === s.entity_id);
        if (e && !entityTouched) setEntityId(e.id);
        const kind = (e ?? refs.entities.find((x) => x.id === entityId))?.kind;
        const c = refs.categories.find((x) => x.id === s.category_id);
        if (c && !categoryTouched && c.direction === (type === "income" ? "in" : "out") && fitsEntity(c.applies_to, kind)) setCategoryId(c.id);
      } catch { /* sem conexão ou cancelado: a sugestão é opcional */ }
    }, 700);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, methodId, personId, type]);

  const draft = (() => {
    if (!amountValid || !launchId || !entityId) return null;
    const parsed = launchSchema.safeParse({
      id: launchId, type, description: description.trim() || (type === "transfer" ? "Transferência" : "Lançamento"),
      amount_cents: cents, date, installments: isCard ? installments : 1,
      payment_method_id: methodId || null, to_payment_method_id: type === "transfer" ? toMethodId || null : null,
      entity_id: entityId, person_id: personId || null, category_id: categoryOk && type !== "transfer" ? categoryId : null,
    });
    return parsed.success ? parsed.data : null;
  })();

  const built = draft ? buildLaunch(draft, method, toMethod) : null;
  const preview =
    built?.ok && built.rows[0].invoice_month && draft
      ? `${draft.installments}x de ${centsToBRL(built.rows[1]?.amount_cents ?? built.rows[0].amount_cents)}${draft.installments > 1 && built.rows[0].amount_cents !== built.rows[1].amount_cents ? ` (1ª: ${centsToBRL(built.rows[0].amount_cents)})` : ""} · fatura de ${mesAno(built.rows[0].invoice_month)}, vence ${dataBR(built.rows[0].cash_date)}`
      : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!amountValid) return setMsg({ tone: "erro", text: "Informe o valor (ex.: 45,90)." });
    if (!draft) return setMsg({ tone: "erro", text: "Confira os campos do lançamento." });
    if (built && !built.ok) return setMsg({ tone: "erro", text: built.error });
    setSaving(true);
    const r = await sendOrQueue(draft);
    setSaving(false);
    if (r.kind === "rejected") return setMsg({ tone: "erro", text: r.error });

    guardar("method", methodId);
    guardar("entity", entityId);
    const resumo = `${centsToBRL(draft.amount_cents)} · ${draft.description}`;
    setMsg(
      r.kind === "sent"
        ? { tone: "ok", text: `Salvo: ${resumo}` }
        : r.reason === "session"
          ? { tone: "info", text: `Guardado no aparelho (sessão expirada). Entre de novo para enviar: ${resumo}` }
          : { tone: "info", text: `Guardado no aparelho, será enviado quando houver conexão: ${resumo}` },
    );
    setAmountText("");
    setDescription("");
    setSugg(null);
    setEntityTouched(false);
    setCategoryTouched(false);
    setInstallments(1);
    setLaunchId(novoId());
    amountRef.current?.focus();
  }

  const input = "w-full rounded-lg border border-line-strong bg-surface-2 text-ink px-3 py-3 text-base";
  const pmOptions = refs.methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>);

  return (
    <form onSubmit={salvar} className="mx-auto flex max-w-md flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label="Tipo">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => { setType(k.value); setCategoryId(""); setInstallments(1); }}
            aria-pressed={type === k.value}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium ${type === k.value ? "bg-brand text-white" : "bg-surface-2"}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Valor (R$)</span>
        <input
          ref={amountRef}
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className="w-full rounded-lg border border-line-strong bg-surface-2 text-ink px-3 py-3 text-3xl font-semibold"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Descrição</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Cometa" className={input} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{type === "transfer" ? "De (sai deste meio)" : "Meio"}</span>
        <select value={methodId} onChange={(e) => { setMethodId(e.target.value); setInstallments(1); }} className={input}>
          {type === "income" && <option value="">Sem meio</option>}
          {pmOptions}
        </select>
      </label>

      {type === "transfer" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Para (entra neste meio)</span>
          <select value={toMethodId} onChange={(e) => setToMethodId(e.target.value)} className={input}>
            <option value="">Escolha…</option>
            {pmOptions}
          </select>
        </label>
      )}

      {isCard && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Parcelas</span>
          <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className={input}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n === 1 ? "À vista (1x)" : `${n}x`}</option>
            ))}
          </select>
          {preview && <span className="text-sm text-muted">{preview}</span>}
          {method && (method.closing_day == null || method.due_day == null) && (
            <span className="text-sm text-red-400">
              Este cartão está sem fechamento/vencimento. Defina em Configurações → Meios de pagamento.
            </span>
          )}
        </label>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">De quem é o gasto</span>
        <div className="flex flex-wrap gap-2">
          {refs.entities.map((e) => (
            <Chip key={e.id} on={entityId === e.id} onClick={() => { setEntityId(e.id); setCategoryId(""); setEntityTouched(true); }}>{e.name}</Chip>
          ))}
        </div>
      </div>

      {type !== "transfer" && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Categoria <span className="font-normal text-muted">(sem categoria vai para revisão)</span></span>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Chip key={c.id} on={categoryId === c.id} onClick={() => { setCategoryTouched(true); setCategoryId(categoryId === c.id ? "" : c.id); }}>{c.name}</Chip>
            ))}
          </div>
        </div>
      )}

      {sugg && (
        <p className="text-sm text-muted">
          {sugg.sure ? "Sugerido" : "Talvez"} ({sugg.source === "ai" ? "IA" : "regra"}
          {sugg.sure ? "" : `, ${Math.round(sugg.confidence * 100)}%`}):{" "}
          {[refs.entities.find((e) => e.id === sugg.entity_id)?.name, refs.categories.find((c) => c.id === sugg.category_id)?.name].filter(Boolean).join(" · ")}
          {!sugg.sure && (
            <button type="button" className="ml-2 underline" onClick={() => {
              if (sugg.entity_id) { setEntityId(sugg.entity_id); setEntityTouched(true); }
              if (sugg.category_id) { setCategoryId(sugg.category_id); setCategoryTouched(true); }
            }}>usar</button>
          )}
        </p>
      )}

      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer p-3 text-sm">Data e quem gastou</summary>
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </label>
          <div className="flex flex-wrap gap-2">
            {refs.people.map((p) => (
              <Chip key={p.id} on={personId === p.id} onClick={() => setPersonId(p.id)}>{p.name}</Chip>
            ))}
          </div>
        </div>
      </details>

      {msg && (
        <p
          role={msg.tone === "erro" ? "alert" : "status"}
          className={`rounded-lg p-3 text-sm ${msg.tone === "ok" ? "bg-emerald-500/10 text-emerald-300" : msg.tone === "info" ? "bg-amber-400/10 text-amber-300" : "bg-red-500/10 text-red-300"}`}
        >
          {msg.text}
        </p>
      )}

      <button disabled={saving} className="rounded-xl bg-gold py-4 text-lg font-semibold text-canvas hover:brightness-110 disabled:opacity-60">
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
