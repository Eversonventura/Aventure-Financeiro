import { cashDateFor, daysInMonth, invoiceMonthFor, parseDate } from "@/lib/invoice";
import type { MethodInfo } from "@/lib/launch";

export type RuleRow = {
  id: string;
  org_id: string;
  direction: "in" | "out";
  description: string;
  amount_cents: number;
  day_of_month: number;
  start_month: string; // sempre dia 1
  end_month: string | null; // null = sem fim
  entity_id: string;
  category_id: string | null;
  payment_method_id: string | null;
  client_id: string | null;
  active: boolean;
};

export type RecurringTx = {
  org_id: string;
  type: "income" | "expense";
  status: "forecast";
  description: string;
  amount_cents: number;
  paid_amount_cents: null;
  competence_date: string;
  cash_date: string;
  invoice_month: string | null;
  entity_id: string;
  payment_method_id: string | null;
  category_id: string | null;
  client_id: string | null;
  recurring_rule_id: string;
  source: "recurring";
  external_id: string; // `${regra}:${AAAA-MM}`: gerar duas vezes não duplica
  needs_review: boolean;
};

export type RecurringResult =
  | { ok: true; row: RecurringTx }
  | { ok: false; reason: "inactive" | "out_of_range" | "card_without_days" };

/** Lançamento previsto que a regra gera para o mês (dia 1 = "AAAA-MM-01"). */
export function buildRecurring(rule: RuleRow, month: string, method: MethodInfo | null): RecurringResult {
  if (!rule.active) return { ok: false, reason: "inactive" };
  if (month < rule.start_month || (rule.end_month && month > rule.end_month)) {
    return { ok: false, reason: "out_of_range" };
  }
  const { y, m } = parseDate(month);
  const date = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(rule.day_of_month, daysInMonth(y, m))).padStart(2, "0")}`;

  let invoice_month: string | null = null;
  let cash_date = date;
  if (method?.kind === "credit_card") {
    if (method.closing_day == null || method.due_day == null) return { ok: false, reason: "card_without_days" };
    invoice_month = invoiceMonthFor(date, method.closing_day, method.due_day);
    cash_date = cashDateFor(invoice_month, method.due_day);
  }

  return {
    ok: true,
    row: {
      org_id: rule.org_id,
      type: rule.direction === "in" ? "income" : "expense",
      status: "forecast",
      description: rule.description,
      amount_cents: rule.amount_cents,
      paid_amount_cents: null,
      competence_date: date,
      cash_date,
      invoice_month,
      entity_id: rule.entity_id,
      payment_method_id: rule.payment_method_id,
      category_id: rule.category_id,
      client_id: rule.client_id,
      recurring_rule_id: rule.id,
      source: "recurring",
      external_id: `${rule.id}:${month.slice(0, 7)}`,
      needs_review: rule.category_id == null,
    },
  };
}
