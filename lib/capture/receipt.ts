import { z } from "zod";
import { cleanDate, cleanInstallments, extractJson, toCents } from "@/lib/capture/voice";
import { EMPTY_CAPTURE, type Capture, type CaptureRefs } from "@/lib/capture/types";
import { matchCard } from "@/lib/sheet/cards";

export const RECEIPT_SYSTEM = `Extraia os dados desta compra a partir da imagem (cupom, nota, comprovante ou print de app).
Responda SOMENTE com JSON:
{"merchant":"nome do estabelecimento","date":"AAAA-MM-DD ou null","total":0.0,"installments":1,"payment_hint":"últimos 4 dígitos ou nome do cartão, se aparecer","confidence":0.0}
Regras:
- total é o valor total pago, em reais, número. Se não estiver legível, total = null.
- Nunca invente um valor, data ou nome que não esteja legível na imagem. Em dúvida, use null.
- installments: número de parcelas se constar; senão 1.
- Se for print de fatura ou de comprovante de app, use a compra principal da imagem.
- confidence de 0 a 1: a sua certeza de ter lido tudo certo.`;

const schema = z.object({
  merchant: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  installments: z.number().nullable().optional(),
  payment_hint: z.string().nullable().optional(),
  confidence: z.number().optional(),
});

/** Campos do cupom para preencher o formulário. Valor ilegível volta vazio; data futura é descartada. */
export function parseReceipt(text: string, refs: CaptureRefs): Capture {
  const a = schema.parse(extractJson(text));
  return {
    ...EMPTY_CAPTURE,
    type: "expense",
    amount_cents: toCents(a.total),
    description: a.merchant?.trim().slice(0, 120) || null,
    date: cleanDate(a.date, refs.today, 1),
    installments: cleanInstallments(a.installments),
    payment_method_id: matchCard(a.payment_hint ?? null, refs.methods)?.id ?? null, // só reconhece pelo nome: nunca guardamos o número do cartão
    confidence: Math.max(0, Math.min(1, a.confidence ?? 0)),
  };
}

/** JPEG de verdade (e não outro arquivo renomeado). */
export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
