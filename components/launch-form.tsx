"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconCamera, IconMic } from "@/components/icons";
import type { Capture } from "@/lib/capture/types";
import { brlToCents, centsToBRL, centsToInput } from "@/lib/format";
import { createCategoryInline, createClientInline } from "@/app/(app)/lancamentos/novo/actions";
import { compressImage } from "@/lib/image";
import { DRE_LINES } from "@/lib/schemas";
import { buildLaunch, launchSchema, type MethodInfo } from "@/lib/launch";
import { fitsEntity } from "@/lib/categories";
import { sendOrQueue } from "@/lib/queue";

export type RefData = {
  entities: { id: string; name: string; kind: "pj" | "pf" | "shared" }[];
  people: { id: string; name: string; default_entity_id: string | null; isMe: boolean }[];
  methods: (MethodInfo & { name: string })[];
  categories: { id: string; name: string; applies_to: "pj" | "pf" | "shared" | null; direction: "in" | "out" }[];
  clients: { id: string; name: string }[];
};

type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};
const speechCtor = (): (new () => SpeechRec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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
export function LaunchForm({ refs, initialType = "expense" }: { refs: RefData; initialType?: "expense" | "income" }) {
  const noCliente = useSyncExternalStore(noop, () => true, () => false);
  if (!noCliente) return <p className="text-muted">Carregando…</p>;
  return <LaunchFormInner refs={refs} initialType={initialType} />;
}

function LaunchFormInner({ refs, initialType }: { refs: RefData; initialType: "expense" | "income" }) {
  const me = refs.people.find((p) => p.isMe);
  const lm = lembrar("method");
  const le = lembrar("entity");
  const [type, setType] = useState<Kind>(initialType);
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
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [extraCats, setExtraCats] = useState<RefData["categories"]>([]);
  const [extraClients, setExtraClients] = useState<RefData["clients"]>([]);
  const [clientId, setClientId] = useState("");
  const [newCat, setNewCat] = useState<{ open: boolean; name: string; line: string }>({ open: false, name: "", line: "" });
  const [newClient, setNewClient] = useState<{ open: boolean; name: string }>({ open: false, name: "" });
  const [creating, setCreating] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState<"voice" | "photo" | null>(null);
  const [canListen] = useState(() => speechCtor() !== null);
  const recRef = useRef<SpeechRec | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const method = refs.methods.find((m) => m.id === methodId) ?? null;
  const toMethod = refs.methods.find((m) => m.id === toMethodId) ?? null;
  const entity = refs.entities.find((e) => e.id === entityId);
  const isCard = type === "expense" && method?.kind === "credit_card";

  const allCategories = [...refs.categories, ...extraCats];
  const categories = allCategories
    .filter((c) => c.direction === (type === "income" ? "in" : "out") && fitsEntity(c.applies_to, entity?.kind))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const allClients = [...refs.clients, ...extraClients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
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
        const c = allCategories.find((x) => x.id === s.category_id);
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
      receipt_path: type === "transfer" ? null : receiptPath,
      client_id: type === "income" && clientId ? clientId : null,
    });
    return parsed.success ? parsed.data : null;
  })();

  const built = draft ? buildLaunch(draft, method, toMethod) : null;
  const preview =
    built?.ok && built.rows[0].invoice_month && draft
      ? `${draft.installments}x de ${centsToBRL(built.rows[1]?.amount_cents ?? built.rows[0].amount_cents)}${draft.installments > 1 && built.rows[0].amount_cents !== built.rows[1].amount_cents ? ` (1ª: ${centsToBRL(built.rows[0].amount_cents)})` : ""} · fatura de ${mesAno(built.rows[0].invoice_month)}, vence ${dataBR(built.rows[0].cash_date)}`
      : null;

  /** Preenche o formulário com o que a voz ou a foto entendeu; a pessoa confere e toca em Salvar. */
  function applyCapture(c: Capture) {
    if (c.type) { setType(c.type); setCategoryId(""); }
    if (c.amount_cents) setAmountText(centsToInput(c.amount_cents));
    if (c.description) setDescription(c.description);
    if (c.date) setDate(c.date);
    const pmId = c.payment_method_id ?? methodId;
    if (c.payment_method_id) setMethodId(c.payment_method_id);
    const isCardMethod = refs.methods.find((m) => m.id === pmId)?.kind === "credit_card";
    if (c.installments != null) setInstallments(c.installments > 1 && isCardMethod && (c.type ?? type) === "expense" ? c.installments : 1);
    if (c.entity_id) { setEntityId(c.entity_id); setEntityTouched(true); setCategoryId(""); }
    const faltou = [c.amount_cents == null ? "o valor" : null, !c.description ? "a descrição" : null].filter(Boolean);
    setMsg({
      tone: c.confidence < 0.6 || faltou.length ? "erro" : "info",
      text: faltou.length ? `Não consegui ler ${faltou.join(" e ")}. Preencha e confira.` : c.confidence < 0.6 ? "Leitura com pouca certeza: confira os campos antes de salvar." : "Preenchido. Confira e toque em Salvar.",
    });
  }

  async function interpret(text: string) {
    if (!text.trim()) return;
    if (!navigator.onLine) return setMsg({ tone: "erro", text: "Sem internet: lance à mão. A fila offline guarda e envia depois." });
    setBusy("voice");
    try {
      const res = await fetch("/api/voz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const body = (await res.json().catch(() => null)) as { capture?: Capture; error?: string } | null;
      if (!res.ok || !body?.capture) return setMsg({ tone: "erro", text: body?.error ?? "Não consegui entender." });
      applyCapture(body.capture);
    } catch {
      setMsg({ tone: "erro", text: "Sem conexão. Tente de novo." });
    } finally {
      setBusy(null);
    }
  }

  function toggleListening() {
    if (listening) { recRef.current?.stop(); return; }
    const SR = speechCtor();
    if (!SR) return;
    const r = new SR();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setPhrase(t);
      if (e.results[e.results.length - 1].isFinal) void interpret(t);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recRef.current = r;
    setMsg(null);
    setListening(true);
    r.start();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (!navigator.onLine) return setMsg({ tone: "erro", text: "Sem internet: a foto precisa de conexão. Lance à mão." });
    setBusy("photo");
    setMsg(null);
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append("file", blob, "cupom.jpg");
      fd.append("launch_id", launchId);
      const res = await fetch("/api/foto", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { path?: string; capture?: Capture | null; warning?: string; error?: string } | null;
      if (!res.ok || !body?.path) return setMsg({ tone: "erro", text: body?.error ?? "Não foi possível enviar a foto." });
      setReceiptPath(body.path);
      if (body.capture) applyCapture(body.capture);
      else setMsg({ tone: "info", text: body.warning ?? "Foto anexada. Preencha os campos." });
    } catch {
      setMsg({ tone: "erro", text: "Não consegui processar a imagem. Tente outra foto." });
    } finally {
      setBusy(null);
    }
  }

  const dreOptions = (type === "income" ? ["gross_revenue", "financial"] : ["admin_expenses", "cost_of_services", "sales_expenses", "financial", "pro_labore", "deductions"]) as (keyof typeof DRE_LINES)[];

  async function criarCategoria() {
    if (!navigator.onLine) return setMsg({ tone: "erro", text: "Sem internet: crie a categoria depois, em Configurações." });
    setCreating(true);
    const kind = entity?.kind;
    const r = await createCategoryInline({
      name: newCat.name, direction: type === "income" ? "in" : "out",
      applies_to: kind === "pj" ? "pj" : kind ? "pf" : null,
      dre_line: (kind === "pj" ? newCat.line || dreOptions[0] : "none") as keyof typeof DRE_LINES,
    });
    setCreating(false);
    if (!r.ok) return setMsg({ tone: "erro", text: r.error });
    setExtraCats((cur) => (cur.some((c) => c.id === r.category.id) ? cur : [...cur, r.category]));
    setCategoryId(r.category.id);
    setCategoryTouched(true);
    setNewCat({ open: false, name: "", line: "" });
    setMsg(null);
  }

  async function criarCliente() {
    if (!navigator.onLine) return setMsg({ tone: "erro", text: "Sem internet: crie o cliente depois, em Configurações." });
    setCreating(true);
    const r = await createClientInline({ name: newClient.name });
    setCreating(false);
    if (!r.ok) return setMsg({ tone: "erro", text: r.error });
    setExtraClients((cur) => (cur.some((c) => c.id === r.client.id) ? cur : [...cur, r.client]));
    setClientId(r.client.id);
    setNewClient({ open: false, name: "" });
    setMsg(null);
  }

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
    setClientId("");
    setReceiptPath(null);
    setPhrase("");
    setVoiceOpen(false);
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
            onClick={() => {
              setType(k.value);
              setCategoryId("");
              setInstallments(1);
              setNewCat({ open: false, name: "", line: "" });
              if (k.value === "income") {
                // entrada de cliente: cai numa conta (não no cartão) e é da empresa, a menos que a pessoa já tenha escolhido
                if (method?.kind === "credit_card") setMethodId(refs.methods.find((m) => m.kind === "bank_account" || m.kind === "pix")?.id ?? "");
                const pj = refs.entities.find((x) => x.kind === "pj");
                if (!entityTouched && pj) setEntityId(pj.id);
              } else {
                setClientId("");
                if (!methodId) setMethodId(refs.methods.some((m) => m.id === lm) ? lm : refs.methods[0]?.id ?? "");
              }
            }}
            aria-pressed={type === k.value}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium ${type === k.value ? "bg-brand text-white" : "bg-surface-2"}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {type !== "transfer" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setVoiceOpen((v) => !v)} disabled={busy !== null}
              className="flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 py-3 text-sm font-medium disabled:opacity-60">
              <IconMic width={18} height={18} /> Voz
            </button>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 py-3 text-sm font-medium ${busy ? "opacity-60" : ""}`}>
              <IconCamera width={18} height={18} /> {busy === "photo" ? "Lendo…" : "Foto do cupom"}
              <input type="file" accept="image/*" className="sr-only" disabled={busy !== null}
                onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {voiceOpen && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <div className="flex gap-2">
                <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Ex.: gastei 45 no Cometa no Itaú em 3 vezes"
                  className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 py-3 text-base text-ink" />
                {canListen && (
                  <button type="button" onClick={toggleListening} aria-pressed={listening} aria-label={listening ? "Parar de ouvir" : "Falar"}
                    className={`flex size-12 shrink-0 items-center justify-center rounded-full ${listening ? "animate-pulse bg-brand text-white" : "bg-surface-2"}`}>
                    <IconMic width={20} height={20} />
                  </button>
                )}
              </div>
              <button type="button" onClick={() => void interpret(phrase)} disabled={busy !== null || phrase.trim().length < 3}
                className="rounded-lg bg-surface-2 py-2.5 text-sm font-medium disabled:opacity-50">
                {busy === "voice" ? "Entendendo…" : "Preencher o formulário"}
              </button>
              {!canListen && <p className="text-xs text-muted">Este navegador não ouve direto. Use o microfone do teclado para ditar a frase.</p>}
            </div>
          )}
          {receiptPath && (
            <p className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              Cupom anexado
              <button type="button" className="underline" onClick={() => setReceiptPath(null)}>remover</button>
            </p>
          )}
        </div>
      )}

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
        <span className="text-sm font-medium">{type === "income" ? "Quem recebe" : type === "transfer" ? "Entidade" : "De quem é o gasto"}</span>
        <div className="flex flex-wrap gap-2">
          {refs.entities.map((e) => (
            <Chip key={e.id} on={entityId === e.id} onClick={() => { setEntityId(e.id); setCategoryId(""); setEntityTouched(true); }}>{e.name}</Chip>
          ))}
        </div>
      </div>

      {type === "income" && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Cliente <span className="font-normal text-muted">(opcional)</span></span>
            <select value={newClient.open ? "__new" : clientId} className={input}
              onChange={(e) => { if (e.target.value === "__new") setNewClient({ open: true, name: "" }); else { setNewClient({ open: false, name: "" }); setClientId(e.target.value); } }}>
              <option value="">Sem cliente (recebimento avulso)</option>
              {allClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ Novo cliente…</option>
            </select>
          </label>
          {newClient.open && (
            <div className="flex gap-2 rounded-xl border border-line bg-surface p-3">
              <input value={newClient.name} onChange={(e) => setNewClient({ open: true, name: e.target.value })} placeholder="Nome do cliente" autoFocus
                className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 text-base text-ink" />
              <button type="button" onClick={() => void criarCliente()} disabled={creating || newClient.name.trim().length < 2} className="rounded-lg bg-gold px-4 font-semibold text-canvas disabled:opacity-50">{creating ? "…" : "Criar"}</button>
            </div>
          )}
        </div>
      )}

      {type !== "transfer" && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Categoria <span className="font-normal text-muted">(sem categoria vai para revisão)</span></span>
            <select value={newCat.open ? "__new" : categoryOk ? categoryId : ""} className={input}
              onChange={(e) => {
                if (e.target.value === "__new") return setNewCat({ open: true, name: "", line: dreOptions[0] });
                setNewCat({ open: false, name: "", line: "" });
                setCategoryTouched(true);
                setCategoryId(e.target.value);
              }}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ Nova categoria…</option>
            </select>
          </label>
          {newCat.open && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Nome da nova categoria" autoFocus
                className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 text-base text-ink" />
              {entity?.kind === "pj" && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Em qual linha do DRE entra?</span>
                  <select value={newCat.line} onChange={(e) => setNewCat({ ...newCat, line: e.target.value })} className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2.5 text-ink">
                    {dreOptions.map((k) => <option key={k} value={k}>{DRE_LINES[k]}</option>)}
                  </select>
                </label>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => void criarCategoria()} disabled={creating || newCat.name.trim().length < 2} className="flex-1 rounded-lg bg-gold py-2.5 font-semibold text-canvas disabled:opacity-50">{creating ? "Criando…" : "Criar e usar"}</button>
                <button type="button" onClick={() => setNewCat({ open: false, name: "", line: "" })} className="rounded-lg border border-line-strong px-4">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {sugg && (
        <p className="text-sm text-muted">
          {sugg.sure ? "Sugerido" : "Talvez"} ({sugg.source === "ai" ? "IA" : "regra"}
          {sugg.sure ? "" : `, ${Math.round(sugg.confidence * 100)}%`}):{" "}
          {[refs.entities.find((e) => e.id === sugg.entity_id)?.name, allCategories.find((c) => c.id === sugg.category_id)?.name].filter(Boolean).join(" · ")}
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
