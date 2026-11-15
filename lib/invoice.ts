// Datas como texto "AAAA-MM-DD", sem Date/fuso: evita erro de "um dia a menos".
// Espelha as funções SQL invoice_month_for e cash_date_for (testadas em paridade).

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m de 1 a 12
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function shiftMonth(y: number, m: number, n: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + n;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02). */
export function addMonths(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const r = shiftMonth(y, m, n);
  return `${r.y}-${pad(r.m)}-${pad(Math.min(d, daysInMonth(r.y, r.m)))}`;
}

/**
 * Mês da fatura (dia 1 do mês de vencimento).
 * Compra no dia do fechamento ou depois cai na fatura seguinte; se o vencimento é
 * menor ou igual ao fechamento, o vencimento é no mês seguinte ao do fechamento.
 * Fechamento 29/30/31 vale o último dia do mês quando o mês é mais curto.
 */
export function invoiceMonthFor(purchase: string, closingDay: number, dueDay: number): string {
  const { y, m, d } = parseDate(purchase);
  const closing = Math.min(closingDay, daysInMonth(y, m));
  const add = (d >= closing ? 1 : 0) + (dueDay <= closingDay ? 1 : 0);
  const r = shiftMonth(y, m, add);
  return `${r.y}-${pad(r.m)}-01`;
}

/** Data de vencimento da fatura (vencimento 31 vira o último dia do mês). */
export function cashDateFor(invoiceMonth: string, dueDay: number): string {
  const { y, m } = parseDate(invoiceMonth);
  return `${y}-${pad(m)}-${pad(Math.min(dueDay, daysInMonth(y, m)))}`;
}

export function addInvoiceMonths(invoiceMonth: string, n: number): string {
  const { y, m } = parseDate(invoiceMonth);
  const r = shiftMonth(y, m, n);
  return `${r.y}-${pad(r.m)}-01`;
}

/** Divide o total em parcelas inteiras; o resto de centavos vai para a primeira. */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base));
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDate(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}
