import { daysInMonth, parseDate } from "@/lib/invoice";

/** Hoje (AAAA-MM-DD) no fuso America/Fortaleza, independente do fuso do servidor. */
export function todayFortaleza(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
}

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export function monthEnd(month: string): string {
  const { y, m } = parseDate(month);
  return `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

/** Diferença em dias entre duas datas AAAA-MM-DD (b - a). */
export function diffDays(a: string, b: string): number {
  const t = (s: string) => { const { y, m, d } = parseDate(s); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthLabel = (month: string) => `${MESES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;

/** "Novembro de 2026": só a primeira letra em maiúscula (o `capitalize` do CSS põe "De" também). */
export const monthTitle = (month: string) => { const l = monthLabel(month); return l.charAt(0).toUpperCase() + l.slice(1); };
