import { addMonths, daysInMonth, parseDate } from "@/lib/invoice";
import type { MethodInfo } from "@/lib/launch";
import { buildRecurring, type RuleRow } from "@/lib/recurrence";

// Fluxo de caixa projetado: soma, dia a dia, o que já está lançado (parcelas, faturas, previstos)
// com as recorrências dos meses que o cron ainda não gerou.

export type DailyFlow = { date: string; inflow: number; outflow: number };
export type FlowDay = { date: string; inflow: number; outflow: number; net: number; balance: number };
export type Bucket = {
  key: string; label: string; inflow: number; outflow: number; net: number;
  endBalance: number; minBalance: number; negative: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const ts = (s: string) => { const { y, m, d } = parseDate(s); return Date.UTC(y, m - 1, d); };

/** Dias de `from` a `to` (inclusive), com saldo corrido a partir de `base` (saldo no dia anterior a `from`). */
export function projectDays(args: { base: number; flows: DailyFlow[]; from: string; to: string }): FlowDay[] {
  const byDate = new Map<string, { inflow: number; outflow: number }>();
  for (const f of args.flows) {
    const cur = byDate.get(f.date) ?? { inflow: 0, outflow: 0 };
    cur.inflow += f.inflow;
    cur.outflow += f.outflow;
    byDate.set(f.date, cur);
  }
  const out: FlowDay[] = [];
  let balance = args.base;
  for (let t = ts(args.from); t <= ts(args.to); t += 86_400_000) {
    const date = fmt(t);
    const f = byDate.get(date) ?? { inflow: 0, outflow: 0 };
    const net = f.inflow - f.outflow;
    balance += net;
    out.push({ date, inflow: f.inflow, outflow: f.outflow, net, balance });
  }
  return out;
}

/**
 * Saldo no fim de `date`: saldo informado + o que se moveu desde a data dele.
 * `cum` = saldo acumulado dos lançamentos até uma data (da view v_cash_flow).
 */
export function balanceAt(opening: { cents: number; date: string | null }, cumAtDate: number, cumAtOpening: number): number {
  return opening.date ? opening.cents + cumAtDate - cumAtOpening : cumAtDate;
}

function bucketize(days: FlowDay[], keyOf: (d: string) => string, labelOf: (k: string) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const d of days) {
    const k = keyOf(d.date);
    const b = map.get(k) ?? { key: k, label: labelOf(k), inflow: 0, outflow: 0, net: 0, endBalance: d.balance, minBalance: d.balance, negative: false };
    b.inflow += d.inflow;
    b.outflow += d.outflow;
    b.net += d.net;
    b.endBalance = d.balance;
    b.minBalance = Math.min(b.minBalance, d.balance);
    b.negative = b.minBalance < 0;
    map.set(k, b);
  }
  return [...map.values()];
}

export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function byMonth(days: FlowDay[]): Bucket[] {
  return bucketize(days, (d) => d.slice(0, 7), (k) => `${MESES_CURTOS[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`);
}

/** Semanas começando na segunda-feira. */
export function weekStart(date: string): string {
  const dow = (new Date(ts(date)).getUTCDay() + 6) % 7; // segunda = 0
  return fmt(ts(date) - dow * 86_400_000);
}
export function byWeek(days: FlowDay[]): Bucket[] {
  return bucketize(days, weekStart, (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`);
}

/** Lançamentos que as regras recorrentes ainda vão gerar (meses sem previsto no banco). */
export function virtualRecurring(args: {
  rules: RuleRow[];
  methods: Map<string, MethodInfo>;
  existingKeys: Set<string>; // external_id dos previstos já gerados
  fromMonth: string; // dia 1
  toMonth: string; // dia 1
}): DailyFlow[] {
  const out: DailyFlow[] = [];
  for (let m = args.fromMonth; m <= args.toMonth; m = addMonths(m, 1).slice(0, 8) + "01") {
    for (const rule of args.rules) {
      const r = buildRecurring(rule, m, rule.payment_method_id ? args.methods.get(rule.payment_method_id) ?? null : null);
      if (!r.ok || args.existingKeys.has(r.row.external_id)) continue;
      out.push({
        date: r.row.cash_date,
        inflow: r.row.type === "income" ? r.row.amount_cents : 0,
        outflow: r.row.type === "expense" ? r.row.amount_cents : 0,
      });
    }
  }
  return out;
}

export const monthEndOf = (m: string) => { const { y, m: mm } = parseDate(m); return `${y}-${pad(mm)}-${pad(daysInMonth(y, mm))}`; };
