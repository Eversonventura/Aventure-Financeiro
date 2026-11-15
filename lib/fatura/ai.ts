import { z } from "zod";
import { extractJson, toCents } from "@/lib/capture/voice";
import { finalizeLines, parseInvoiceDate } from "@/lib/fatura/normalize";
import type { ParsedInvoice } from "@/lib/fatura/types";

export const INVOICE_SYSTEM = `Você extrai os lançamentos de uma fatura de cartão de crédito (PDF).
Responda SOMENTE com JSON:
{"due_date":"AAAA-MM-DD ou null","lines":[{"date":"AAAA-MM-DD","description":"estabelecimento como aparece","amount":45.9,"installment":"3/12 ou null"}]}
Regras:
- Inclua só compras e encargos reais da fatura (anuidade, juros, IOF) e estornos/créditos. NÃO inclua pagamento da fatura, total, limite, saldo anterior, resumo nem informações de pagamento.
- amount em reais, número: positivo para compra ou encargo, NEGATIVO para estorno ou crédito.
- date é a data da compra. Se o ano não aparecer na linha, use o do vencimento (se a data for depois do vencimento, é do ano anterior).
- installment: "n/N" se a linha indicar parcela; senão null. Não repita "n/N" na descrição.
- Nunca invente linha, valor ou data. Linha ilegível: omita.`;

const schema = z.object({
  due_date: z.string().nullable().optional(),
  lines: z.array(z.object({
    date: z.string(), description: z.string().min(1).max(160), amount: z.number(), installment: z.string().nullable().optional(),
  })).max(500),
});

/** Valida a resposta do Claude e converte para linhas da fatura. Linha com data ou valor inválido é descartada. */
export function parseInvoiceAnswer(text: string, ref: string): ParsedInvoice {
  const a = schema.parse(extractJson(text));
  const rows: { date: string; description: string; amount_cents: number; inst?: string | null }[] = [];
  let dropped = 0;
  for (const l of a.lines) {
    const date = parseInvoiceDate(l.date, ref);
    const abs = toCents(Math.abs(l.amount));
    if (!date || abs == null) { dropped++; continue; }
    rows.push({ date, description: l.installment ? `${l.description} ${l.installment}` : l.description, amount_cents: l.amount < 0 ? -abs : abs });
  }
  const { lines } = finalizeLines(rows.map(({ date, description, amount_cents }) => ({ date, description, amount_cents })));
  const warnings = dropped ? [`${dropped} linha(s) que a IA leu com data ou valor inválido foram descartadas.`] : [];
  return { lines, warnings, dueDate: a.due_date && parseInvoiceDate(a.due_date, ref) ? parseInvoiceDate(a.due_date, ref) : null };
}
