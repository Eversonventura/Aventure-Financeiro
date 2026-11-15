import { z } from "zod";
import { addInvoiceMonths, isValidDate } from "@/lib/invoice";
import { matchCard } from "@/lib/sheet/cards";
import { norm } from "@/lib/sheet/extract";
import { EMPTY_CAPTURE, type Capture, type CaptureRefs } from "@/lib/capture/types";

export const VOICE_SYSTEM = `Você transforma uma frase falada em um lançamento financeiro de uma família que tem uma agência de marketing.
Exemplo: "gastei 45 no Cometa no Itaú em 3 vezes" -> valor 45, descrição "Cometa", meio "Itaú", 3 parcelas.
Responda SOMENTE com JSON:
{"type":"expense|income","amount":45.0,"description":"Cometa","payment_method":"Itaú","installments":3,"date":null,"entity":null,"confidence":0.0}
Regras:
- amount em reais, número (converta "quarenta e cinco reais e cinquenta" para 45.5). Se o valor não for claro, amount = null. Nunca invente.
- type: "expense" para gasto/paguei/comprei; "income" para recebi/entrou/ganhei.
- description: o estabelecimento ou o motivo, curto, com a grafia que a pessoa falou. Sem o valor, o meio ou as parcelas.
- payment_method: o nome do cartão/conta citado, como a pessoa falou, ou null. installments: número de parcelas citado ("em 3 vezes" = 3), ou null.
- date: AAAA-MM-DD só se a pessoa citar uma data ("ontem", "dia 10"); resolva pela data de hoje informada. Senão null.
- entity: só se a pessoa disser de quem é o gasto ("da empresa", "da casa", "do Alexandre"), usando o nome da lista; senão null.
- confidence de 0 a 1.`;

export const buildVoiceUser = (text: string, refs: CaptureRefs) =>
  `Hoje: ${refs.today}\nMeios cadastrados: ${refs.methods.map((m) => m.name).join(", ") || "nenhum"}\nEntidades: ${refs.entities.map((e) => e.name).join(", ")}\nFrase: ${JSON.stringify(text.slice(0, 500))}`;

const schema = z.object({
  type: z.enum(["expense", "income"]).nullable().optional(),
  amount: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  installments: z.number().nullable().optional(),
  date: z.string().nullable().optional(),
  entity: z.string().nullable().optional(),
  confidence: z.number().optional(),
});

export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("A resposta do Claude não trouxe um JSON.");
  return JSON.parse(t.slice(a, b + 1));
}

/** Valor em reais (número) -> centavos; só valores positivos e razoáveis. */
export function toCents(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0 || v > 1_000_000) return null;
  return Math.round((v + Number.EPSILON) * 100);
}

export const cleanInstallments = (n: number | null | undefined): number | null =>
  n != null && Number.isInteger(n) && n >= 1 && n <= 48 ? n : null;

/** Data válida e dentro de um ano para cada lado de hoje; senão null. */
export function cleanDate(d: string | null | undefined, today: string, allowFutureDays = 365): string | null {
  if (!d || !isValidDate(d)) return null;
  const min = addInvoiceMonths(today, -12);
  const max = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + allowFutureDays)).toISOString().slice(0, 10);
  return d >= min && d <= max ? d : null;
}

export function parseVoice(text: string, refs: CaptureRefs): Capture {
  const a = schema.parse(extractJson(text));
  const description = a.description?.trim().slice(0, 120) || null;
  const entity = a.entity ? refs.entities.find((e) => norm(e.name) === norm(a.entity!)) ?? null : null;
  return {
    ...EMPTY_CAPTURE,
    type: a.type ?? null,
    amount_cents: toCents(a.amount),
    description,
    date: cleanDate(a.date, refs.today),
    installments: cleanInstallments(a.installments),
    payment_method_id: matchCard(a.payment_method ?? null, refs.methods)?.id ?? null,
    entity_id: entity?.id ?? null,
    confidence: Math.max(0, Math.min(1, a.confidence ?? 0)),
  };
}
