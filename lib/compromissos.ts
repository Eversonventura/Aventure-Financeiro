import { z } from "zod";
import { brlToCents } from "@/lib/format";
import { addMonths, isValidDate } from "@/lib/invoice";

export const KINDS = { loan: "Empréstimo", financing: "Financiamento", consortium: "Consórcio" } as const;
export type Kind = keyof typeof KINDS;

export type Commitment = {
  id: string; kind: Kind; name: string; entity_id: string; institution: string | null; payment_method_id: string | null;
  category_id: string | null; installment_cents: number; installments: number; paid_before: number; first_due_date: string;
  contracted_cents: number | null; contemplated_on: string | null; notes: string | null; active: boolean;
};

/** Vencimento da parcela n (1 = primeira), sempre a partir da 1ª: dia 31 vira o último dia dos meses curtos sem "escorregar". */
export const dueDate = (firstDue: string, n: number) => addMonths(firstDue, n - 1);

export type InstallmentTx = {
  type: "expense"; status: "forecast"; description: string; amount_cents: number; paid_amount_cents: null;
  competence_date: string; cash_date: string; invoice_month: null; entity_id: string; person_id: null;
  payment_method_id: string | null; category_id: string | null; client_id: null; installment_group_id: null; installment_number: null;
  recurring_rule_id: null; commitment_id: string; source: "recurring"; external_id: string; needs_review: false;
};

export const externalId = (commitmentId: string, n: number) => `commit:${commitmentId}:${n}`;
export function nFromExternal(external: string | null, commitmentId: string): number | null {
  const m = external?.match(new RegExp(`^commit:${commitmentId}:(\\d+)$`));
  return m ? Number(m[1]) : null;
}

/** A parcela n como lançamento previsto. */
export function installmentRow(c: Commitment, n: number): InstallmentTx {
  const due = dueDate(c.first_due_date, n);
  return {
    type: "expense", status: "forecast", description: `${c.name} ${n}/${c.installments}`, amount_cents: c.installment_cents, paid_amount_cents: null,
    competence_date: due, cash_date: due, invoice_month: null, entity_id: c.entity_id, person_id: null, payment_method_id: c.payment_method_id,
    category_id: c.category_id, client_id: null, installment_group_id: null, installment_number: null, recurring_rule_id: null,
    commitment_id: c.id, source: "recurring", external_id: externalId(c.id, n), needs_review: false,
  };
}

export type ExistingInstallment = { id: string; n: number; status: string };
export type SyncPlan = {
  create: InstallmentTx[];
  update: { id: string; patch: Pick<InstallmentTx, "description" | "amount_cents" | "competence_date" | "cash_date" | "entity_id" | "payment_method_id" | "category_id"> }[];
  remove: string[];
};

/**
 * Deixa as parcelas no banco iguais ao cadastro: cria as que faltam, atualiza as que ainda não foram pagas
 * e remove as não pagas que passaram do total. Parcela paga nunca é mexida.
 */
export function planSync(c: Commitment, existing: ExistingInstallment[]): SyncPlan {
  const byN = new Map(existing.map((e) => [e.n, e]));
  const plan: SyncPlan = { create: [], update: [], remove: [] };
  const last = c.active ? c.installments : 0; // encerrado: não mantém parcelas futuras
  for (let n = c.paid_before + 1; n <= last; n++) {
    const row = installmentRow(c, n);
    const cur = byN.get(n);
    if (!cur) { plan.create.push(row); continue; }
    if (cur.status === "paid") continue;
    const { description, amount_cents, competence_date, cash_date, entity_id, payment_method_id, category_id } = row;
    plan.update.push({ id: cur.id, patch: { description, amount_cents, competence_date, cash_date, entity_id, payment_method_id, category_id } });
  }
  for (const e of existing) if (e.status !== "paid" && (e.n > last || e.n <= c.paid_before)) plan.remove.push(e.id);
  return plan;
}

export type InstTx = { n: number; status: string; amount_cents: number; paid_amount_cents: number | null; cash_date: string };
export type Summary = {
  paidCount: number; remaining: number; progress: number; nextDue: string | null; nextCents: number | null;
  endDate: string; remainingCents: number; paidCents: number; totalCents: number; late: number;
  state: "em_dia" | "atrasado" | "quitado" | "encerrado";
};

/** Situação do compromisso: quantas parcelas pagas, quanto falta, próxima e última data. */
export function summarize(c: Commitment, txs: InstTx[], today: string): Summary {
  const paid = txs.filter((t) => t.status === "paid");
  const unpaid = txs.filter((t) => t.status !== "paid").sort((a, b) => (a.cash_date < b.cash_date ? -1 : 1));
  const paidCount = c.paid_before + paid.length;
  const remaining = Math.max(0, c.installments - paidCount);
  const late = unpaid.filter((t) => t.cash_date < today).length;
  const state = !c.active && remaining > 0 ? "encerrado" : remaining === 0 ? "quitado" : late > 0 ? "atrasado" : "em_dia";
  return {
    paidCount, remaining, progress: Math.round((paidCount / c.installments) * 100), nextDue: unpaid[0]?.cash_date ?? null,
    nextCents: unpaid[0]?.amount_cents ?? null, endDate: dueDate(c.first_due_date, c.installments),
    remainingCents: unpaid.reduce((s, t) => s + t.amount_cents, 0), paidCents: paid.reduce((s, t) => s + (t.paid_amount_cents ?? t.amount_cents), 0),
    totalCents: c.installment_cents * c.installments, late, state,
  };
}

/** Quanto pesa por mês (parcelas ainda não pagas), do mês `from` por `months` meses. */
export function monthlyLoad(items: { cash_date: string; amount_cents: number; status: string }[], from: string, months: number): { month: string; cents: number }[] {
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(from, i).slice(0, 7);
    return { month: `${m}-01`, cents: items.filter((t) => t.status !== "paid" && t.cash_date.slice(0, 7) === m).reduce((s, t) => s + t.amount_cents, 0) };
  });
}

const optUuid = z.union([z.uuid(), z.literal("")]).transform((s) => (s === "" ? null : s));
const optText = z.string().trim().max(200).transform((s) => (s === "" ? null : s));
const moneyReq = (msg: string) =>
  z.string().transform((s, ctx) => {
    const c = brlToCents(s);
    if (c == null || Number.isNaN(c) || c <= 0) { ctx.addIssue({ code: "custom", message: msg }); return z.NEVER; }
    return c;
  });
const moneyOpt = (msg: string) =>
  z.string().transform((s, ctx): number | null => {
    const c = brlToCents(s);
    if (c == null) return null;
    if (Number.isNaN(c)) { ctx.addIssue({ code: "custom", message: msg }); return z.NEVER; }
    return c;
  });
const int = (msg: string, min: number, max: number) =>
  z.string().transform((s, ctx) => {
    const n = Number(s);
    if (s.trim() === "" || !Number.isInteger(n) || n < min || n > max) { ctx.addIssue({ code: "custom", message: msg }); return z.NEVER; }
    return n;
  });
const optDate = z.string().transform((s, ctx) => {
  if (s === "") return null;
  if (!isValidDate(s)) { ctx.addIssue({ code: "custom", message: "Data inválida." }); return z.NEVER; }
  return s;
});

/** Formulário de criação: o próximo vencimento + quantas parcelas já foram pagas definem a data da 1ª. */
export const createSchema = z.object({
  kind: z.enum(["loan", "financing", "consortium"], { error: "Escolha o tipo." }),
  name: z.string().trim().min(2, { error: "Informe o nome." }).max(80),
  entity_id: z.uuid({ error: "Escolha de quem é." }),
  institution: optText,
  payment_method_id: optUuid,
  category_id: optUuid,
  installment: moneyReq("Informe o valor da parcela (ex.: 850,00)."),
  installments: int("O total de parcelas deve estar entre 1 e 600.", 1, 600),
  paid_before: int("Parcelas já pagas: use 0 se nenhuma.", 0, 599),
  next_due: z.string().refine(isValidDate, { error: "Informe a data do próximo vencimento." }),
  contracted: moneyOpt("Valor contratado inválido."),
  contemplated_on: optDate,
  notes: optText,
}).refine((v) => v.paid_before < v.installments, { error: "As parcelas já pagas precisam ser menos que o total." });

/** Edição: não mexe em datas nem nas parcelas já pagas. */
export const editSchema = z.object({
  name: z.string().trim().min(2, { error: "Informe o nome." }).max(80),
  entity_id: z.uuid({ error: "Escolha de quem é." }),
  institution: optText,
  payment_method_id: optUuid,
  category_id: optUuid,
  installment: moneyReq("Informe o valor da parcela (ex.: 850,00)."),
  installments: int("O total de parcelas deve estar entre 1 e 600.", 1, 600),
  contracted: moneyOpt("Valor contratado inválido."),
  contemplated_on: optDate,
  notes: optText,
});
