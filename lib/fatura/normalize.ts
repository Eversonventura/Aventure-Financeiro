import { brlToCents } from "@/lib/format";
import { diffDays } from "@/lib/dates";
import { isValidDate } from "@/lib/invoice";
import { norm } from "@/lib/sheet/extract";
import { parseInstallment } from "@/lib/sheet/plan";
import type { InvoiceLine } from "@/lib/fatura/types";

/** "1.234,56" | "1234.56" | "(45,90)" | "-45,90" | "45,90-" | "R$ 45,90" -> centavos com sinal. null se não for dinheiro. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) {
    const c = brlToCents(s);
    if (c == null || Number.isNaN(c)) return null;
    return neg ? -c : c;
  }
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) { // formato americano: 1,234.56 ou 45.90
    normalized = s.replace(/,/g, "");
    const [i, d = ""] = normalized.split(".");
    const c = Number(i) * 100 + Number(d.padEnd(2, "0"));
    return neg ? -c : c;
  }
  return null;
}

/**
 * Data da fatura -> AAAA-MM-DD. Aceita 14/11/2026, 14/11/26, 2026-11-14, 20261114 e 14/11 (sem ano).
 * Sem ano, usa o ano de `ref`; se a data cair mais de 60 dias depois dele, é do ano anterior (fatura de janeiro com compra de dezembro).
 */
export function parseInvoiceDate(raw: string, ref: string): string | null {
  const s = raw.trim().slice(0, 10);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && isValidDate(`${m[1]}-${m[2]}-${m[3]}`)) return `${m[1]}-${m[2]}-${m[3]}`;
  m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (m && isValidDate(`${m[1]}-${m[2]}-${m[3]}`)) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidDate(iso) ? iso : null;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (m) {
    const mk = (y: number) => `${y}-${m![2].padStart(2, "0")}-${m![1].padStart(2, "0")}`;
    let iso = mk(Number(ref.slice(0, 4)));
    if (!isValidDate(iso)) return null;
    if (diffDays(ref, iso) > 60) iso = mk(Number(ref.slice(0, 4)) - 1);
    return isValidDate(iso) ? iso : null;
  }
  return null;
}

/** Linhas que não são compra: pagamento da fatura, totais, saldos. */
const SKIP = /pagamento (recebido|de fatura|efetuado|fatura|on line|online)|obrigado pelo pagamento|pgto (fatura|recebido)|^total\b|total (da )?fatura|subtotal|saldo (anterior|restante|da fatura)|fatura anterior|^pagamento$/;
export const isNonPurchase = (description: string) => SKIP.test(norm(description));

/** Monta as linhas: arruma o sinal (compra positiva), separa "3/12" da descrição e descarta pagamentos e totais. */
export function finalizeLines(rows: { date: string; description: string; amount_cents: number }[]): { lines: InvoiceLine[]; flipped: boolean } {
  const kept = rows.filter((r) => r.amount_cents !== 0 && !isNonPurchase(r.description));
  const neg = kept.filter((r) => r.amount_cents < 0).length;
  const flipped = kept.length > 0 && neg > kept.length / 2; // há bancos que mostram a compra como negativa
  const lines = kept.map((r) => {
    const p = parseInstallment(r.description);
    return {
      date: r.date, description: (p?.base ?? r.description).replace(/[-–\s]*parcela\s*$/i, "").replace(/\s+/g, " ").trim(), amount_cents: flipped ? -r.amount_cents : r.amount_cents,
      installment: p ? { n: p.n, total: p.total } : null,
    };
  });
  return { lines, flipped };
}
