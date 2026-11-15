import { z } from "zod";
import {
  addInvoiceMonths, addMonths, cashDateFor, invoiceMonthFor, isValidDate, splitInstallments,
} from "@/lib/invoice";

export const launchSchema = z.object({
  id: z.uuid(), // gerado no aparelho: reenviar o mesmo lançamento não duplica
  type: z.enum(["expense", "income", "transfer"]),
  description: z.string().trim().min(1, { error: "Informe a descrição." }).max(200),
  amount_cents: z.number().int().positive({ error: "Informe um valor maior que zero." }).max(100_000_000_00),
  date: z.string().refine(isValidDate, { error: "Data inválida." }),
  installments: z.number().int().min(1).max(48).default(1),
  payment_method_id: z.uuid().nullable(),
  to_payment_method_id: z.uuid().nullable().default(null),
  entity_id: z.uuid({ error: "Escolha a entidade." }),
  person_id: z.uuid().nullable().default(null),
  category_id: z.uuid().nullable().default(null),
  notes: z.string().trim().max(500).nullable().default(null),
  client_id: z.uuid().nullable().default(null), // entrada: de qual cliente veio
  receipt_path: z.string().max(100).regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i).nullable().default(null), // foto do cupom (Storage)
});
export type LaunchInput = z.infer<typeof launchSchema>;

export type MethodInfo = {
  id: string;
  kind: "credit_card" | "bank_account" | "pix" | "cash";
  closing_day: number | null;
  due_day: number | null;
};

export type GroupRow = {
  id: string;
  description: string;
  installment_cents: number;
  installments: number;
  purchase_date: string;
  first_invoice_month: string;
  payment_method_id: string;
};

export type TxRow = {
  type: "expense" | "income" | "transfer";
  status: "pending" | "paid";
  description: string;
  amount_cents: number;
  paid_amount_cents: number | null;
  competence_date: string;
  cash_date: string;
  invoice_month: string | null;
  entity_id: string;
  person_id: string | null;
  payment_method_id: string | null;
  category_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  transfer_pair_id: string | null;
  source: "manual";
  external_id: string; // `${id}:${n}`: torna o envio idempotente
  needs_review: boolean;
  notes: string | null;
  receipt_path: string | null;
  client_id: string | null;
};

export type BuildResult =
  | { ok: true; group: GroupRow | null; rows: TxRow[] }
  | { ok: false; error: string };

const fail = (error: string): BuildResult => ({ ok: false, error });

/**
 * Transforma um lançamento do celular nas linhas que vão para o banco.
 * - Cartão: uma linha por parcela, cada uma na sua fatura; status "pendente" até a fatura ser paga.
 * - Pix, conta e dinheiro: sai no dia, já "pago".
 * - Competência (DRE) de cada parcela = data da compra + (n-1) meses (decisão a confirmar com a contadora).
 * - Sem categoria: vai para a fila de revisão (needs_review).
 */
export function buildLaunch(input: LaunchInput, method: MethodInfo | null, toMethod: MethodInfo | null = null): BuildResult {
  const base = {
    entity_id: input.entity_id,
    person_id: input.person_id,
    source: "manual" as const,
    notes: input.notes,
  };

  if (input.type === "transfer") {
    if (!method || !toMethod) return fail("Escolha de onde sai e para onde vai o dinheiro.");
    if (method.id === toMethod.id) return fail("Origem e destino precisam ser diferentes.");
    if (input.installments !== 1) return fail("Transferência não pode ser parcelada.");
    const leg = (suffix: "out" | "in", pm: string, label: string): TxRow => ({
      ...base,
      type: "transfer",
      status: "paid",
      description: `${input.description} (${label})`,
      amount_cents: input.amount_cents,
      paid_amount_cents: input.amount_cents,
      competence_date: input.date,
      cash_date: input.date,
      invoice_month: null,
      payment_method_id: pm,
      category_id: null,
      installment_group_id: null,
      installment_number: null,
      transfer_pair_id: input.id,
      external_id: `${input.id}:${suffix}`,
      needs_review: false,
      receipt_path: null,
      client_id: null,
    });
    return { ok: true, group: null, rows: [leg("out", method.id, "saída"), leg("in", toMethod.id, "entrada")] };
  }

  if (input.type === "expense" && !method) return fail("Escolha o meio de pagamento.");
  const isCard = method?.kind === "credit_card";
  if (input.installments > 1 && !(input.type === "expense" && isCard)) {
    return fail("Só compras no cartão de crédito podem ser parceladas.");
  }

  let firstInvoice: string | null = null;
  if (isCard) {
    if (method.closing_day == null || method.due_day == null) {
      return fail("Defina o fechamento e o vencimento deste cartão em Configurações → Meios de pagamento.");
    }
    firstInvoice = invoiceMonthFor(input.date, method.closing_day, method.due_day);
  }

  const n = input.installments;
  const parts = splitInstallments(input.amount_cents, n);
  const groupId = n > 1 ? input.id : null;

  const rows: TxRow[] = parts.map((cents, i) => {
    const invoice_month = firstInvoice ? addInvoiceMonths(firstInvoice, i) : null;
    return {
      ...base,
      type: input.type,
      status: isCard ? "pending" : "paid",
      description: input.description,
      amount_cents: cents,
      paid_amount_cents: isCard ? null : cents,
      competence_date: addMonths(input.date, i),
      cash_date: invoice_month ? cashDateFor(invoice_month, method!.due_day!) : input.date,
      invoice_month,
      payment_method_id: method?.id ?? null,
      category_id: input.category_id,
      installment_group_id: groupId,
      installment_number: n > 1 ? i + 1 : null,
      transfer_pair_id: null,
      external_id: `${input.id}:${i + 1}`,
      needs_review: input.category_id == null,
      receipt_path: i === 0 ? input.receipt_path : null, // a foto fica na 1ª linha
      client_id: input.type === "income" ? input.client_id : null,
    };
  });

  const group: GroupRow | null =
    n > 1
      ? {
          id: input.id,
          description: input.description,
          installment_cents: parts[1],
          installments: n,
          purchase_date: input.date,
          first_invoice_month: firstInvoice!,
          payment_method_id: method!.id,
        }
      : null;

  return { ok: true, group, rows };
}
