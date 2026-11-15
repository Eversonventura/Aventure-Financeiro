import { finalizeLines, parseInvoiceDate, parseMoney } from "@/lib/fatura/normalize";
import type { ParsedInvoice } from "@/lib/fatura/types";

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : "";
};

/** Extrato OFX (cartão ou conta): uma linha por <STMTTRN>. Funciona com OFX em SGML (sem tags de fechamento) e em XML. */
export function parseOfx(text: string, ref: string): ParsedInvoice {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows: { date: string; description: string; amount_cents: number }[] = [];
  let ignored = 0;
  for (const b of blocks) {
    const date = parseInvoiceDate(tag(b, "DTPOSTED"), ref);
    const amount = parseMoney(tag(b, "TRNAMT"));
    const description = (tag(b, "MEMO") || tag(b, "NAME")).replace(/&amp;/g, "&");
    if (!date || amount == null || !description) { ignored++; continue; }
    rows.push({ date, description, amount_cents: amount });
  }
  const { lines, flipped } = finalizeLines(rows);
  const warnings: string[] = [];
  if (blocks.length === 0) warnings.push("Não encontrei transações neste arquivo OFX.");
  if (ignored > 0) warnings.push(`${ignored} transação(ões) sem data, valor ou descrição foram ignoradas.`);
  if (flipped) warnings.push("O arquivo mostra as compras como valores negativos: ajustei o sinal.");
  return { lines, warnings };
}
