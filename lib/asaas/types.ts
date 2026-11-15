import { z } from "zod";

// Tolerante de propósito: aceita campos a mais e só exige o que precisamos para baixar a cobrança.
export const paymentSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  value: z.number(),
  netValue: z.number().optional().nullable(),
  status: z.string().optional().nullable(),
  billingType: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  paymentDate: z.string().optional().nullable(),
  clientPaymentDate: z.string().optional().nullable(),
  confirmedDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
}).passthrough();
export type AsaasPayment = z.infer<typeof paymentSchema>;

export const webhookSchema = z.object({
  id: z.string().optional().nullable(), // id do evento (evt_...)
  event: z.string().min(1),
  payment: paymentSchema.optional().nullable(),
}).passthrough();
export type AsaasWebhook = z.infer<typeof webhookSchema>;

/** Eventos que significam "o dinheiro entrou" (ou foi confirmado). */
export const PAID_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED_IN_CASH"] as const;
export const REFUND_EVENTS = ["PAYMENT_REFUNDED"] as const;
export const PAID_STATUSES = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"] as const;
