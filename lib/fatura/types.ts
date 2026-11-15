export type InvoiceLine = {
  date: string; // AAAA-MM-DD
  description: string;
  amount_cents: number; // compra positiva; estorno/crédito negativo
  installment: { n: number; total: number } | null;
};
export type ParsedInvoice = { lines: InvoiceLine[]; warnings: string[]; dueDate?: string | null };
