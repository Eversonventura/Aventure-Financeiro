import { finalizeLines, parseInvoiceDate, parseMoney } from "@/lib/fatura/normalize";
import { norm } from "@/lib/sheet/extract";
import type { ParsedInvoice } from "@/lib/fatura/types";

/** Divide o texto em linhas e campos (aspas e vírgulas dentro de aspas). */
export function splitCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const detectDelimiter = (text: string) => {
  const head = text.split(/\r?\n/).slice(0, 5).join("\n");
  const count = (d: string) => (head.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length;
  return [";", ",", "\t"].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][0];
};

const DATE_NAMES = ["data", "date", "data da compra", "data compra", "dt compra", "data lancamento", "data do lancamento", "posted date"];
const DESC_NAMES = ["descricao", "title", "titulo", "historico", "estabelecimento", "lancamento", "merchant", "memo", "name", "detalhes", "descricao da compra"];
const AMOUNT_NAMES = ["valor", "amount", "valor (r$)", "valor r$", "value", "quantia", "valor em r$"];

/**
 * Lê o CSV da fatura (Nubank, Itaú e parecidos): acha as colunas de data, descrição e valor pelo cabeçalho
 * (ou pelo formato dos dados, se não houver cabeçalho) e devolve as compras.
 */
export function parseInvoiceCsv(text: string, ref: string): ParsedInvoice {
  const rows = splitCsv(text, detectDelimiter(text));
  const warnings: string[] = [];
  if (rows.length === 0) return { lines: [], warnings: ["O arquivo está vazio."] };

  const headIdx = rows.findIndex((r) => {
    const n = r.map(norm);
    return n.some((c) => DATE_NAMES.includes(c)) && n.some((c) => AMOUNT_NAMES.includes(c));
  });
  let dateCol = -1, descCol = -1, amountCol = -1, start = 0;
  if (headIdx >= 0) {
    const n = rows[headIdx].map(norm);
    dateCol = n.findIndex((c) => DATE_NAMES.includes(c));
    amountCol = n.findIndex((c) => AMOUNT_NAMES.includes(c));
    descCol = n.findIndex((c) => DESC_NAMES.includes(c));
    start = headIdx + 1;
  } else {
    // sem cabeçalho: descobre pela cara dos dados nas primeiras linhas
    const sample = rows.slice(0, 8);
    const cols = Math.max(...sample.map((r) => r.length));
    const score = (test: (v: string) => boolean) => Array.from({ length: cols }, (_, c) => sample.filter((r) => test(r[c] ?? "")).length);
    const dates = score((v) => parseInvoiceDate(v, ref) !== null), money = score((v) => parseMoney(v) !== null && /[\d]/.test(v) && /[,.]/.test(v));
    dateCol = dates.indexOf(Math.max(...dates));
    amountCol = money.indexOf(Math.max(...money));
    const text2 = score((v) => /[a-zA-ZÀ-ú]{3,}/.test(v));
    descCol = text2.indexOf(Math.max(...text2));
    if (dates[dateCol] === 0 || money[amountCol] === 0) return { lines: [], warnings: ["Não reconheci as colunas de data e valor neste CSV."] };
  }
  if (dateCol < 0 || amountCol < 0) return { lines: [], warnings: ["Não encontrei as colunas de data e valor no cabeçalho do CSV."] };
  if (descCol < 0) descCol = rows[start]?.findIndex((_, i) => i !== dateCol && i !== amountCol) ?? -1;

  const parsed: { date: string; description: string; amount_cents: number }[] = [];
  let ignored = 0;
  for (const r of rows.slice(start)) {
    const date = parseInvoiceDate(r[dateCol] ?? "", ref);
    const amount = parseMoney(r[amountCol] ?? "");
    const description = (r[descCol] ?? "").trim();
    if (!date || amount == null || !description) { ignored++; continue; }
    parsed.push({ date, description, amount_cents: amount });
  }
  const { lines, flipped } = finalizeLines(parsed);
  if (ignored > 0) warnings.push(`${ignored} linha(s) sem data, valor ou descrição foram ignoradas.`);
  if (flipped) warnings.push("O arquivo mostra as compras como valores negativos: ajustei o sinal.");
  return { lines, warnings };
}
