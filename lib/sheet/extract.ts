import { brlToCents } from "@/lib/format";
import { isValidDate } from "@/lib/invoice";
import type { Layout, Region } from "@/lib/sheet/layout";
import type { Cell, Grid } from "@/lib/sheet/read";

export type RawItem = {
  regionId: string;
  kind: "monthly_bills" | "income" | "card_purchases";
  month: string | null; // AAAA-MM do bloco
  cardId: string | null;
  row: number;
  description: string;
  amountCents: number;
  date: string | null; // data completa, se a planilha trouxer
  day: number | null; // só o dia do mês, se for o que a planilha traz
};
export type Ignored = { regionId: string; row: number; description: string; reason: string };
export type Extracted = { items: RawItem[]; ignored: Ignored[]; warnings: string[] };

/** minúsculas, sem acento, espaços normalizados. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const TOTAIS = ["total", "subtotal", "soma", "total geral", "saldo", "sobra", "resultado"];
export const isTotalRow = (desc: string) => {
  const n = norm(desc).replace(/[:.]+$/, "");
  return TOTAIS.includes(n) || n.startsWith("total ");
};

function parseAmount(v: Cell): number | null | "invalid" {
  if (v == null) return null;
  if (typeof v === "number") return Math.round(v * 100);
  const c = brlToCents(v.replace(/^-/, ""));
  if (c == null) return null;
  if (Number.isNaN(c)) return "invalid";
  return v.trim().startsWith("-") ? -c : c;
}

function parseDateCell(v: Cell, month: string | null): { date: string | null; day: number | null } {
  if (v == null) return { date: null, day: null };
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= 31 ? { date: null, day: v } : { date: null, day: null };
  const s = v.trim();
  if (isValidDate(s)) return { date: s, day: Number(s.slice(8, 10)) };
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    let y = m[3] ? Number(m[3]) : month ? Number(month.slice(0, 4)) : NaN;
    if (y < 100) y += 2000;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (Number.isFinite(y) && isValidDate(iso)) return { date: iso, day: d };
    if (d >= 1 && d <= 31) return { date: null, day: d };
  }
  if (/^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31) return { date: null, day: Number(s) };
  return { date: null, day: null };
}

function extractRegion(g: Grid, r: Region, out: Extracted) {
  if (r.kind === "ignore" || r.kind === "invoice_total") return;
  for (let row = r.firstRow; row <= Math.min(r.lastRow, g.rows.length); row++) {
    const line = g.rows[row - 1] ?? [];
    const rawDesc = line[r.descriptionCol - 1];
    const amount = parseAmount(line[r.valueCol - 1] ?? null);
    if (amount == null || amount === 0) continue; // linha sem valor: título, espaço ou item sem gasto
    const description = rawDesc == null ? "" : String(rawDesc).trim();
    const skip = (reason: string) => out.ignored.push({ regionId: r.id, row, description, reason });
    if (!description || typeof rawDesc === "number") { skip("sem descrição"); continue; }
    if (isTotalRow(description)) { skip("linha de total"); continue; }
    if (amount === "invalid") { skip("valor ilegível"); continue; }
    if (amount < 0) { skip("valor negativo"); continue; }
    const { date, day } = parseDateCell(r.dateCol ? line[r.dateCol - 1] ?? null : null, r.month);
    out.items.push({ regionId: r.id, kind: r.kind, month: r.month, cardId: r.cardId, row, description, amountCents: amount, date, day });
  }
}

/** Lê os blocos do mapa e devolve os itens brutos, mais o que foi ignorado e por quê. */
export function extract(grids: Grid[], layout: Layout): Extracted {
  const out: Extracted = { items: [], ignored: [], warnings: [] };
  const by = new Map(grids.map((g) => [g.name, g]));
  for (const r of layout.regions) {
    const g = by.get(r.sheet);
    if (!g) { out.warnings.push(`Aba "${r.sheet}" não encontrada.`); continue; }
    if ((r.kind === "monthly_bills" || r.kind === "card_purchases" || r.kind === "income") && !r.month) {
      out.warnings.push(`O bloco "${r.label || r.id}" está sem mês e foi ignorado.`);
      continue;
    }
    extractRegion(g, r, out);
  }
  return out;
}
