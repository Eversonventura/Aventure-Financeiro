import { diffDays } from "@/lib/dates";
import { PAID_EVENTS, PAID_STATUSES, REFUND_EVENTS, type AsaasPayment } from "@/lib/asaas/types";

export const toCents = (v: number) => Math.round((v + Number.EPSILON) * 100);

export type ExpectedTx = { id: string; amount_cents: number; cash_date: string; status: string };
export type ExistingLink = { status: string; transaction_id: string | null; fee_transaction_id: string | null; prev_cash_date: string | null } | null;
export type Defaults = { pjEntityId: string | null; revenueCategoryId: string | null; feeCategoryId: string | null; methodId: string | null };

export type NewIncome = {
  type: "income"; status: "paid"; description: string; amount_cents: number; paid_amount_cents: number; competence_date: string; cash_date: string;
  invoice_month: null; entity_id: string; payment_method_id: string | null; category_id: string | null; client_id: string; source: "asaas";
  external_id: string; needs_review: boolean;
};
export type FeeTx = {
  type: "expense"; status: "paid"; description: string; amount_cents: number; paid_amount_cents: number; competence_date: string; cash_date: string;
  invoice_month: null; entity_id: string; payment_method_id: string | null; category_id: string | null; source: "asaas"; external_id: string; needs_review: boolean;
};

export type Plan =
  | { kind: "ignore"; reason: string }
  | { kind: "already" }
  | { kind: "mark"; txId: string; patch: { status: "paid"; paid_amount_cents: number; cash_date: string }; prevCashDate: string; fee: FeeTx | null }
  | { kind: "create"; row: NewIncome; fee: FeeTx | null }
  | { kind: "refund"; txId: string | null; patch: { status: "pending"; paid_amount_cents: null; cash_date?: string }; removeFeeTxId: string | null };

export const isPaidEvent = (event: string, status?: string | null) =>
  (PAID_EVENTS as readonly string[]).includes(event) || (event === "" && (PAID_STATUSES as readonly string[]).includes(status ?? ""));
export const isRefundEvent = (event: string) => (REFUND_EVENTS as readonly string[]).includes(event);

/** A data em que o dinheiro entrou, na ordem em que o Asaas costuma informar. */
export const paidDateOf = (p: AsaasPayment, today: string) => p.paymentDate || p.clientPaymentDate || p.confirmedDate || today;

/** A cobrança esperada que a baixa deve atingir: a não paga mais próxima do vencimento, dentro de 35 dias. */
export function pickExpected(cands: ExpectedTx[], dueDate: string | null | undefined, valueCents: number): ExpectedTx | null {
  const open = cands.filter((c) => c.status !== "paid");
  if (open.length === 0) return null;
  const ref = dueDate || null;
  const scored = open
    .map((c) => ({ c, d: ref ? Math.abs(diffDays(ref, c.cash_date)) : 0, a: Math.abs(c.amount_cents - valueCents) }))
    .filter((x) => !ref || x.d <= 35)
    .sort((x, y) => x.d - y.d || x.a - y.a);
  return scored[0]?.c ?? null;
}

function feeOf(p: AsaasPayment, entityId: string, defaults: Defaults, date: string): FeeTx | null {
  if (p.netValue == null || p.netValue >= p.value) return null;
  const fee = toCents(p.value) - toCents(p.netValue);
  if (fee <= 0) return null;
  return {
    type: "expense", status: "paid", description: "Tarifa Asaas", amount_cents: fee, paid_amount_cents: fee, competence_date: date, cash_date: date,
    invoice_month: null, entity_id: entityId, payment_method_id: defaults.methodId, category_id: defaults.feeCategoryId, source: "asaas",
    external_id: `asaas:fee:${p.id}`, needs_review: defaults.feeCategoryId == null,
  };
}

/**
 * Decide o que fazer com um evento de pagamento do Asaas. Função pura: quem chama busca os dados e executa o plano.
 * - Pago: baixa a mensalidade esperada do cliente (valor real e data do dinheiro); sem esperada, cria a entrada.
 * - Já baixado antes (ex.: "confirmado" e depois "recebido"): não conta de novo.
 * - Estornado: volta a mensalidade para pendente.
 */
export function planPayment(args: {
  event: string; payment: AsaasPayment; client: { id: string; name: string } | null; existing: ExistingLink;
  candidates: ExpectedTx[]; defaults: Defaults; today: string;
}): Plan {
  const { event, payment: p, client, existing, candidates, defaults, today } = args;

  if (isRefundEvent(event)) {
    if (!existing || existing.status !== "paid") return { kind: "ignore", reason: "estorno de cobrança que não foi baixada aqui" };
    return {
      kind: "refund", txId: existing.transaction_id,
      patch: { status: "pending", paid_amount_cents: null, ...(existing.prev_cash_date ? { cash_date: existing.prev_cash_date } : {}) },
      removeFeeTxId: existing.fee_transaction_id,
    };
  }
  if (!isPaidEvent(event)) return { kind: "ignore", reason: `evento sem ação (${event})` };
  if (!client) return { kind: "ignore", reason: "cliente do Asaas não está vinculado a nenhum cliente daqui" };
  if (existing?.status === "paid") return { kind: "already" };

  const value = toCents(p.value);
  if (value <= 0) return { kind: "ignore", reason: "valor zerado" };
  const date = paidDateOf(p, today);
  const entityId = defaults.pjEntityId;
  const expected = pickExpected(candidates, p.dueDate, value);

  if (expected) {
    return {
      kind: "mark", txId: expected.id, patch: { status: "paid", paid_amount_cents: value, cash_date: date }, prevCashDate: expected.cash_date,
      fee: entityId ? feeOf(p, entityId, defaults, date) : null,
    };
  }
  if (!entityId) return { kind: "ignore", reason: "não há entidade da empresa (PJ) cadastrada" };
  return {
    kind: "create",
    row: {
      type: "income", status: "paid", description: p.description?.trim() || client.name, amount_cents: value, paid_amount_cents: value,
      competence_date: p.dueDate || date, cash_date: date, invoice_month: null, entity_id: entityId, payment_method_id: defaults.methodId,
      category_id: defaults.revenueCategoryId, client_id: client.id, source: "asaas", external_id: `asaas:pay:${p.id}`, needs_review: defaults.revenueCategoryId == null,
    },
    fee: feeOf(p, entityId, defaults, date),
  };
}
