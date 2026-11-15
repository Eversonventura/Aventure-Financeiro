import ExcelJS from "exceljs";

// Planilha lida em memória: células viram texto ou número; datas viram "AAAA-MM-DD".
export type Cell = string | number | null;
export type Grid = { name: string; rows: Cell[][] }; // rows[r-1][c-1]; 1-based nas referências

export const MAX_ROWS = 600;
export const MAX_COLS = 80;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "boolean") return v ? "VERDADEIRO" : "FALSO";
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue); // fórmula: vale o resultado
    if ("richText" in v) return cellValue(v.richText.map((t) => t.text).join(""));
    if ("text" in v) return cellValue(String(v.text)); // hyperlink
    if ("error" in v) return null;
  }
  return null;
}

/** Lê um .xlsx (inclusive o exportado do Google Sheets). Só valores: fórmulas valem o resultado salvo. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const grids: Grid[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r > MAX_ROWS) return;
      const line: Cell[] = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > MAX_COLS) return;
        while (line.length < c - 1) line.push(null);
        line[c - 1] = cellValue(cell.value);
      });
      while (rows.length < r - 1) rows.push([]);
      rows[r - 1] = line;
    });
    if (rows.some((r) => r.some((c) => c != null))) grids.push({ name: ws.name, rows });
  });
  return grids;
}

export const colLetter = (c: number): string => {
  let s = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Texto das células com coordenadas, para o Claude entender o layout. */
export function dumpGrids(grids: Grid[], maxChars = 120_000): string {
  const out: string[] = [];
  let size = 0;
  for (const g of grids) {
    out.push(`### Aba "${g.name}"`);
    for (let r = 0; r < g.rows.length; r++) {
      const cells = g.rows[r]
        .map((v, c) => (v == null ? null : `${colLetter(c + 1)}=${typeof v === "number" ? v : JSON.stringify(String(v).slice(0, 48))}`))
        .filter(Boolean);
      if (cells.length === 0) continue;
      const line = `L${r + 1}: ${cells.join(" | ")}`;
      size += line.length;
      if (size > maxChars) { out.push("(… planilha truncada)"); return out.join("\n"); }
      out.push(line);
    }
  }
  return out.join("\n");
}
