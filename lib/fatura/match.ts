import { diffDays } from "@/lib/dates";
import { norm } from "@/lib/sheet/extract";
import type { InvoiceLine } from "@/lib/fatura/types";

/** Lançamento do sistema que cai na fatura. `amount_cents`: gasto positivo, entrada/estorno negativo. */
export type SysTx = { id: string; description: string; amount_cents: number; date: string; installment_number: number | null };

export type MatchResult = {
  matched: { line: InvoiceLine; tx: SysTx }[];
  amountDiff: { line: InvoiceLine; tx: SysTx }[]; // descrição e data batem, valor não
  missing: InvoiceLine[]; // está na fatura e não foi lançado
  extra: SysTx[]; // foi lançado e não aparece na fatura
};

export const DATE_TOLERANCE_DAYS = 3;

const STOP = new Set(["de", "da", "do", "dos", "das", "com", "para", "pag", "mp", "ifd", "sumup", "pix", "loja", "lojas", "ltda", "sa", "cartao"]);
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w));

/** Descrição parecida: uma contém a outra, ou têm uma palavra relevante em comum (ex.: "UBER *TRIP" e "Uber"). */
export function similar(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  const ta = tokens(a), tb = tokens(b);
  return ta.some((x) => tb.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4))))));
}

type Pair = { li: number; ti: number; tier: 1 | 2 | 3; gap: number };

/**
 * Cruza as linhas da fatura com os lançamentos do cartão naquela fatura.
 * 1) mesmo valor, data até ±3 dias e descrição parecida; 2) mesmo valor e data (o nome que você digitou costuma diferir do
 * estabelecimento); 3) descrição e data batem mas o valor não. Parcela (n/N) casa pelo número da parcela, sem olhar a data.
 * Cada linha e cada lançamento são usados uma vez só, começando pelos casamentos mais fortes.
 */
export function matchInvoice(lines: InvoiceLine[], txs: SysTx[]): MatchResult {
  const pairs: Pair[] = [];
  lines.forEach((line, li) => {
    txs.forEach((tx, ti) => {
      const amountEq = line.amount_cents === tx.amount_cents;
      const bothInst = !!line.installment && tx.installment_number != null;
      const instEq = bothInst && line.installment!.n === tx.installment_number;
      const gap = Math.abs(diffDays(line.date, tx.date));
      const dateOk = bothInst ? instEq : gap <= DATE_TOLERANCE_DAYS;
      const desc = similar(line.description, tx.description);
      if (amountEq && dateOk && desc) pairs.push({ li, ti, tier: 1, gap });
      else if (amountEq && dateOk) pairs.push({ li, ti, tier: 2, gap });
      else if (!amountEq && dateOk && desc) pairs.push({ li, ti, tier: 3, gap });
    });
  });
  pairs.sort((a, b) => a.tier - b.tier || a.gap - b.gap || a.li - b.li || a.ti - b.ti);

  const usedL = new Set<number>(), usedT = new Set<number>();
  const result: MatchResult = { matched: [], amountDiff: [], missing: [], extra: [] };
  for (const p of pairs) {
    if (usedL.has(p.li) || usedT.has(p.ti)) continue;
    usedL.add(p.li); usedT.add(p.ti);
    (p.tier === 3 ? result.amountDiff : result.matched).push({ line: lines[p.li], tx: txs[p.ti] });
  }
  result.missing = lines.filter((_, i) => !usedL.has(i));
  result.extra = txs.filter((_, i) => !usedT.has(i));
  return result;
}
