import { createHash, randomUUID } from "node:crypto";
import { addInvoiceMonths, cashDateFor, daysInMonth, invoiceMonthFor, parseDate } from "@/lib/invoice";
import { norm, type Ignored, type RawItem } from "@/lib/sheet/extract";

export type PmInfo = {
  id: string; name: string; kind: string; owner_entity_id: string; holder_person_id: string | null;
  closing_day: number | null; due_day: number | null;
};
export type PlanCtx = {
  today: string;
  methods: PmInfo[];
  entities: { id: string; name: string; kind: "pj" | "pf" | "shared" }[];
  clients: { id: string; name: string }[];
  existingKeys: Set<string>; // external_id já gravados
  existingFingerprints: Set<string>; // fingerprint() de lançamentos já gravados (qualquer origem)
  existingRules: { description: string; direction: "in" | "out"; payment_method_id: string | null }[];
  newId?: () => string;
};

export type TxOut = {
  type: "expense" | "income"; status: "pending" | "paid" | "forecast"; description: string;
  amount_cents: number; paid_amount_cents: number | null; competence_date: string; cash_date: string;
  invoice_month: string | null; entity_id: string; person_id: string | null; payment_method_id: string | null;
  category_id: string | null; client_id: string | null; installment_group_id: string | null; installment_number: number | null;
  recurring_rule_id: string | null; source: "import_sheet" | "recurring"; external_id: string; needs_review: boolean;
  ai_confidence?: number | null; ai_suggestion?: { entity_id: string | null; category_id: string | null; person_id: string | null; question: string | null; source: string } | null;
};
export type GroupOut = {
  id: string; description: string; installment_cents: number; installments: number;
  purchase_date: null; first_invoice_month: string; payment_method_id: string;
};
export type RuleOut = {
  id: string; direction: "in" | "out"; description: string; amount_cents: number; day_of_month: number;
  start_month: string; end_month: null; entity_id: string; category_id: string | null; payment_method_id: string | null;
  client_id: string | null; active: true;
};
export type PlanStats = {
  items: number; created: number; duplicate: number; ignored: number;
  groups: number; installmentTxs: number; rules: number;
};
export type Plan = { groups: GroupOut[]; rules: RuleOut[]; txs: TxOut[]; stats: PlanStats; warnings: string[]; ignored: Ignored[] };

const pad = (n: number) => String(n).padStart(2, "0");
const shift = (ym: string, n: number) => addInvoiceMonths(`${ym}-01`, n).slice(0, 7);
const clampDay = (ym: string, d: number) => `${ym}-${pad(Math.min(d, daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7))))}`;
const addDays = (date: string, n: number) => {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** Identifica o "mesmo" lançamento mesmo com ids diferentes: reimportar a planilha não duplica. */
export const fingerprint = (t: { description: string; amount_cents: number; cash_date: string; payment_method_id: string | null }) =>
  `${norm(t.description)}|${t.amount_cents}|${t.cash_date}|${t.payment_method_id ?? ""}`;
const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 14);

/** "MACBOOK 11/12" -> { base: "MACBOOK", n: 11, total: 12 }. Só vale n <= total e total >= 2. */
export function parseInstallment(desc: string): { base: string; n: number; total: number } | null {
  const re = /(?:^|[\s(\-–])(\d{1,2})\s*\/\s*(\d{1,2})\)?(?=$|[\s\-–.,;:])/g;
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(desc))) last = match;
  if (!last) return null;
  const n = Number(last[1]);
  const total = Number(last[2]);
  if (total < 2 || total > 48 || n < 1 || n > total) return null;
  const base = (desc.slice(0, last.index) + " " + desc.slice(last.index + last[0].length))
    .replace(/^[\s)\-–.,;:]+|[\s(\-–]+$/g, "").replace(/\s+/g, " ").trim();
  return { base: base || desc.trim(), n, total };
}

function cardTokens(methods: PmInfo[]): Set<string> {
  const t = new Set<string>();
  for (const m of methods) for (const w of norm(m.name).split(/[^a-z0-9]+/)) if (w.length >= 4 && w !== "cartao" && w !== "credito") t.add(w);
  return t;
}

export function buildPlan(items: RawItem[], ignoredIn: Ignored[], ctx: PlanCtx): Plan {
  const newId = ctx.newId ?? randomUUID;
  const warnings: string[] = [];
  const ignored: Ignored[] = [...ignoredIn];
  const groups: GroupOut[] = [];
  const rules: RuleOut[] = [];
  const txs: TxOut[] = [];
  let duplicate = 0;

  const method = new Map(ctx.methods.map((m) => [m.id, m]));
  const casa = ctx.entities.find((e) => e.kind === "shared") ?? ctx.entities[0];
  const pj = ctx.entities.find((e) => e.kind === "pj") ?? ctx.entities[0];
  const tokens = cardTokens(ctx.methods);
  const warned = new Set<string>();
  const warnOnce = (k: string, msg: string) => { if (!warned.has(k)) { warned.add(k); warnings.push(msg); } };

  const skip = (it: RawItem, reason: string) => ignored.push({ regionId: it.regionId, row: it.row, description: it.description, reason });
  const isPast = (cash: string) => cash < ctx.today;

  // cartões
  const cashOf = (m: PmInfo, im: string) => {
    if (m.due_day) return cashDateFor(`${im}-01`, m.due_day);
    warnOnce(`due:${m.id}`, `"${m.name}" está sem vencimento: usei o dia 1 de cada fatura. Defina em Configurações → Meios de pagamento.`);
    return `${im}-01`;
  };
  // sem data de compra na planilha: meio do período da fatura (15 dias antes do fechamento)
  const competenceOf = (m: PmInfo, im: string) => {
    if (!m.closing_day) return `${im}-01`;
    const closeMonth = m.due_day != null && m.due_day <= m.closing_day ? shift(im, -1) : im;
    return addDays(clampDay(closeMonth, m.closing_day), -15);
  };

  const isDuplicate = (t: TxOut) => ctx.existingKeys.has(t.external_id) || ctx.existingFingerprints.has(fingerprint(t));
  const push = (t: TxOut, groupDupes?: { n: number }) => {
    if (isDuplicate(t)) { duplicate++; if (groupDupes) groupDupes.n++; return false; }
    txs.push(t);
    return true;
  };

  // separa os itens
  const card: RawItem[] = [];
  const bills: RawItem[] = [];
  const income: RawItem[] = [];
  for (const it of items) {
    if (it.kind === "card_purchases") {
      const m = it.cardId ? method.get(it.cardId) : null;
      if (!m) { skip(it, "cartão do bloco não identificado"); continue; }
      card.push(it);
    } else if (it.kind === "monthly_bills") {
      const n = norm(it.description);
      if (tokens.has(n) || n.startsWith("fatura") || ctx.methods.some((m) => norm(m.name) === n)) { skip(it, "fatura do cartão (as compras já estão detalhadas)"); continue; }
      bills.push(it);
    } else income.push(it);
  }

  // --- 1. compras parceladas (n/N): um grupo por compra, com todas as parcelas
  const parcelGroups = new Map<string, { base: string; total: number; cardId: string; amount: number; members: { n: number; im: string }[] }>();
  const nonParcel: RawItem[] = [];
  for (const it of card) {
    const p = parseInstallment(it.description);
    if (!p) { nonParcel.push(it); continue; }
    const key = `${it.cardId}|${norm(p.base)}|${it.amountCents}|${p.total}`;
    const g = parcelGroups.get(key) ?? { base: p.base, total: p.total, cardId: it.cardId!, amount: it.amountCents, members: [] };
    g.members.push({ n: p.n, im: it.month! });
    parcelGroups.set(key, g);
  }
  for (const [key, g] of parcelGroups) {
    const m = method.get(g.cardId)!;
    const firsts = g.members.map((x) => shift(x.im, -(x.n - 1)));
    const first = firsts.reduce((a, b) => (a < b ? a : b));
    if (new Set(firsts).size > 1) warnings.push(`"${g.base}": as parcelas da planilha não seguem meses consecutivos; usei a mais antiga como 1ª.`);
    const gid = newId();
    const dupes = { n: 0 };
    const rows: TxOut[] = [];
    for (let i = 0; i < g.total; i++) {
      const im = shift(first, i);
      const cash = cashOf(m, im);
      const past = isPast(cash);
      const t: TxOut = {
        type: "expense", status: past ? "paid" : "pending", description: g.base, amount_cents: g.amount,
        paid_amount_cents: past ? g.amount : null, competence_date: competenceOf(m, im), cash_date: cash, invoice_month: `${im}-01`,
        entity_id: m.owner_entity_id, person_id: m.holder_person_id, payment_method_id: m.id, category_id: null, client_id: null,
        installment_group_id: gid, installment_number: i + 1, recurring_rule_id: null, source: "import_sheet",
        external_id: `sheet:grp:${sha(`${key}|${first}`)}:${i + 1}`, needs_review: true,
      };
      if (push(t, dupes)) rows.push(t);
    }
    if (rows.length > 0) groups.push({ id: gid, description: g.base, installment_cents: g.amount, installments: g.total, purchase_date: null, first_invoice_month: `${first}-01`, payment_method_id: m.id });
  }
  const installmentTxs = txs.length;

  // --- 2. recorrências: assinaturas no cartão (mesmo valor em 3+ meses) e contas fixas (2+ meses)
  const hasRule = (desc: string, dir: "in" | "out", pm: string | null) =>
    ctx.existingRules.some((r) => norm(r.description) === norm(desc) && r.direction === dir && r.payment_method_id === pm);
  const used = new Set<RawItem>();

  type Rec = { items: RawItem[]; dir: "in" | "out"; pm: PmInfo | null };
  const recGroups = new Map<string, Rec>();
  const addRec = (key: string, it: RawItem, dir: "in" | "out", pm: PmInfo | null) => {
    const g = recGroups.get(key) ?? { items: [], dir, pm };
    g.items.push(it);
    recGroups.set(key, g);
  };
  for (const it of nonParcel) addRec(`card|${it.cardId}|${norm(it.description)}|${it.amountCents}`, it, "out", method.get(it.cardId!)!);
  for (const it of bills) addRec(`bill|${norm(it.description)}`, it, "out", null);
  for (const it of income) addRec(`inc|${norm(it.description)}`, it, "in", null);

  for (const [key, g] of recGroups) {
    const months = new Set(g.items.map((i) => i.month));
    const min = key.startsWith("card|") ? 3 : 2;
    if (months.size < min || g.items.length !== months.size) continue; // repetição no mesmo mês não é recorrência
    const sorted = [...g.items].sort((a, b) => (a.month! < b.month! ? -1 : 1));
    const latest = sorted[sorted.length - 1];
    if (hasRule(latest.description, g.dir, g.pm?.id ?? null)) continue;

    const m = g.pm;
    let day = 1;
    let monthOffset = 0; // mês de competência = mês do bloco + offset
    if (m && m.closing_day && m.due_day) {
      // acha o dia de cobrança cuja fatura (pela regra do cartão) cai no mês do bloco
      const im = `${sorted[0].month}-01`;
      outer: for (const off of [0, -1]) {
        for (let d = 1; d <= 28; d++) {
          if (invoiceMonthFor(`${shift(sorted[0].month!, off)}-${pad(d)}`, m.closing_day, m.due_day) === im) { day = d; monthOffset = off; break outer; }
        }
      }
    } else if (!m) {
      day = latest.day ?? 1;
    }
    const entity = m ? m.owner_entity_id : g.dir === "in" ? pj.id : casa.id;
    const client = g.dir === "in" ? ctx.clients.find((c) => norm(latest.description).includes(norm(c.name)) || norm(c.name).includes(norm(latest.description)))?.id ?? null : null;
    const rid = newId();
    const rows: TxOut[] = [];
    for (const it of sorted) {
      const cm = shift(it.month!, monthOffset);
      const comp = clampDay(cm, day);
      const cash = m ? cashOf(m, it.month!) : comp;
      const past = isPast(cash);
      const t: TxOut = {
        type: g.dir === "in" ? "income" : "expense", status: past ? "paid" : "forecast", description: it.description,
        amount_cents: it.amountCents, paid_amount_cents: past ? it.amountCents : null, competence_date: comp, cash_date: cash,
        invoice_month: m ? `${it.month}-01` : null, entity_id: entity, person_id: m?.holder_person_id ?? null,
        payment_method_id: m?.id ?? null, category_id: null, client_id: client, installment_group_id: null, installment_number: null,
        // mesma chave que o cron usa (regra:mês): o cron não gera de novo os meses importados
        recurring_rule_id: rid, source: "recurring", external_id: `${rid}:${cm}`, needs_review: true,
      };
      if (isDuplicate(t)) { duplicate++; continue; }
      rows.push(t);
      used.add(it);
    }
    if (rows.length === 0) continue;
    for (const t of rows) txs.push(t);
    rules.push({
      id: rid, direction: g.dir, description: latest.description, amount_cents: latest.amountCents, day_of_month: day,
      start_month: `${shift(sorted[0].month!, monthOffset)}-01`, end_month: null, entity_id: entity, category_id: null,
      payment_method_id: m?.id ?? null, client_id: client, active: true,
    });
  }

  // --- 3. itens avulsos
  const occ = new Map<string, number>();
  const plain = (it: RawItem) => {
    const k = `${it.regionId}|${it.month}|${norm(it.description)}|${it.amountCents}`;
    const idx = (occ.get(k) ?? 0) + 1;
    occ.set(k, idx);
    const external_id = `sheet:${sha(`${k}|${idx}`)}`;
    if (it.kind === "card_purchases") {
      const m = method.get(it.cardId!)!;
      const im = it.month!;
      const cash = cashOf(m, im);
      const past = isPast(cash);
      push({
        type: "expense", status: past ? "paid" : "pending", description: it.description, amount_cents: it.amountCents,
        paid_amount_cents: past ? it.amountCents : null, competence_date: it.date ?? competenceOf(m, im), cash_date: cash, invoice_month: `${im}-01`,
        entity_id: m.owner_entity_id, person_id: m.holder_person_id, payment_method_id: m.id, category_id: null, client_id: null,
        installment_group_id: null, installment_number: null, recurring_rule_id: null, source: "import_sheet", external_id, needs_review: true,
      });
    } else {
      const date = it.date ?? clampDay(it.month!, it.day ?? 1);
      const past = isPast(date);
      push({
        type: it.kind === "income" ? "income" : "expense", status: past ? "paid" : "pending", description: it.description,
        amount_cents: it.amountCents, paid_amount_cents: past ? it.amountCents : null, competence_date: date, cash_date: date, invoice_month: null,
        entity_id: it.kind === "income" ? pj.id : casa.id, person_id: null, payment_method_id: null, category_id: null,
        client_id: it.kind === "income" ? ctx.clients.find((c) => norm(it.description).includes(norm(c.name)))?.id ?? null : null,
        installment_group_id: null, installment_number: null, recurring_rule_id: null, source: "import_sheet", external_id, needs_review: true,
      });
    }
  };
  for (const it of [...nonParcel, ...bills, ...income]) if (!used.has(it)) plain(it);

  return {
    groups, rules, txs, warnings, ignored,
    stats: {
      items: items.length + ignoredIn.length, created: txs.length, duplicate, ignored: ignored.length,
      groups: groups.length, installmentTxs, rules: rules.length,
    },
  };
}
