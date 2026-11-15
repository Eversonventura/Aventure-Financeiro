import { addInvoiceMonths } from "@/lib/invoice";
import { MESES_CURTOS } from "@/lib/cashflow";

/** Linha da view v_dre_monthly, com entradas e saídas separadas. */
export type DreRowS = { month: string; dre_line: string; income_cents: number; expense_cents: number };

export type DreInput = {
  rows: DreRowS[];
  withdrawals: Record<string, number>; // AAAA-MM -> gastos pessoais pagos pela Aventure (v_settlements)
  rate: number | null; // alíquota efetiva do Simples (0.06 = 6%)
};

export type DreMonth = {
  month: string; label: string;
  receita: number;
  das: number; dasKind: "pago" | "previsto" | "sem_aliquota"; dasPago: number; dasPrevisto: number | null;
  cancelamentos: number; receitaLiquida: number; custo: number; margem: number;
  administrativas: number; comerciais: number; estrutura: number; prolabore: number;
  resultadoOperacional: number; financeiro: number; lucroLiquido: number;
  distribuicao: number; caixaRetido: number;
};

const ym = (m: string) => m.slice(0, 7);

/** O DRE de um mês (dia 1) da Aventure, na estrutura da especificação (ME, Simples Nacional). */
export function dreMonth(input: DreInput, month: string): DreMonth {
  const net = (line: string, side: "in" | "out") => {
    let income = 0, expense = 0;
    for (const r of input.rows) {
      if (ym(r.month) !== ym(month) || r.dre_line !== line) continue;
      income += r.income_cents;
      expense += r.expense_cents;
    }
    return side === "in" ? income - expense : expense - income; // receita: entra - sai; custo: sai - entra (estorno abate)
  };
  const hasLine = (line: string) => input.rows.some((r) => ym(r.month) === ym(month) && r.dre_line === line);

  const receita = net("gross_revenue", "in");
  const dasPago = net("tax", "out");
  const dasPrevisto = input.rate != null ? Math.round(receita * input.rate) : null;
  // DAS pago manda; sem pagamento lançado, vale a alíquota efetiva × receita
  const usaPago = hasLine("tax") && dasPago > 0;
  const das = usaPago ? dasPago : dasPrevisto ?? 0;
  const dasKind = usaPago ? "pago" : dasPrevisto != null ? "previsto" : "sem_aliquota";
  const cancelamentos = net("deductions", "out");
  const receitaLiquida = receita - das - cancelamentos;
  const custo = net("cost_of_services", "out");
  const margem = receitaLiquida - custo;
  const administrativas = net("admin_expenses", "out");
  const comerciais = net("sales_expenses", "out");
  const estrutura = net("structure_expenses", "out");
  const prolabore = net("pro_labore", "out");
  const resultadoOperacional = margem - administrativas - comerciais - estrutura - prolabore;
  const financeiro = net("financial", "in"); // ±: rendimentos positivos, tarifas e juros negativos
  const lucroLiquido = resultadoOperacional + financeiro;
  const distribuicao = (input.withdrawals[ym(month)] ?? 0) + net("distribution", "out");
  return {
    month, label: `${MESES_CURTOS[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`,
    receita, das, dasKind, dasPago, dasPrevisto, cancelamentos, receitaLiquida, custo, margem,
    administrativas, comerciais, estrutura, prolabore, resultadoOperacional, financeiro, lucroLiquido,
    distribuicao, caixaRetido: lucroLiquido - distribuicao,
  };
}

export type LineKey =
  | "receita" | "das" | "cancelamentos" | "receitaLiquida" | "custo" | "margem" | "administrativas" | "comerciais"
  | "estrutura" | "prolabore" | "resultadoOperacional" | "financeiro" | "lucroLiquido" | "distribuicao" | "caixaRetido";

export type LineDef = { key: LineKey; label: string; subtotal: boolean; drill: string | null };

/** Linhas do DRE na ordem da especificação. `drill` é a linha do plano de categorias que abre os lançamentos. */
export const DRE_ROWS: LineDef[] = [
  { key: "receita", label: "(+) Receita bruta e serviços", subtotal: false, drill: "gross_revenue" },
  { key: "das", label: "(−) Simples Nacional (DAS)", subtotal: false, drill: "tax" },
  { key: "cancelamentos", label: "(−) Cancelamentos e descontos", subtotal: false, drill: "deductions" },
  { key: "receitaLiquida", label: "= Receita líquida", subtotal: true, drill: null },
  { key: "custo", label: "(−) Custo dos serviços prestados", subtotal: false, drill: "cost_of_services" },
  { key: "margem", label: "= Margem de contribuição", subtotal: true, drill: null },
  { key: "administrativas", label: "(−) Despesas administrativas", subtotal: false, drill: "admin_expenses" },
  { key: "comerciais", label: "(−) Despesas comerciais", subtotal: false, drill: "sales_expenses" },
  { key: "estrutura", label: "(−) Despesas de estrutura", subtotal: false, drill: "structure_expenses" },
  { key: "prolabore", label: "(−) Pró-labore", subtotal: false, drill: "pro_labore" },
  { key: "resultadoOperacional", label: "= Resultado operacional", subtotal: true, drill: null },
  { key: "financeiro", label: "(±) Resultado financeiro", subtotal: false, drill: "financial" },
  { key: "lucroLiquido", label: "= Lucro líquido", subtotal: true, drill: null },
  { key: "distribuicao", label: "(−) Distribuição e retiradas", subtotal: false, drill: "retiradas" },
  { key: "caixaRetido", label: "= Caixa retido na empresa", subtotal: true, drill: null },
];

export type DreTableRow = LineDef & { value: number; pct: number | null; prev: number; avg3: number; vsPrev: number | null };

/** Mês escolhido com a comparação: mês anterior e média dos 3 meses anteriores a ele. */
export function dreTable(input: DreInput, month: string): { cur: DreMonth; prev: DreMonth; rows: DreTableRow[] } {
  const cur = dreMonth(input, month);
  const before = [1, 2, 3].map((n) => dreMonth(input, addInvoiceMonths(month, -n)));
  const prev = before[0];
  const rows = DRE_ROWS.map((d) => {
    const value = cur[d.key];
    const avg3 = Math.round(before.reduce((s, m) => s + m[d.key], 0) / 3);
    return {
      ...d, value, prev: prev[d.key], avg3,
      pct: cur.receita > 0 ? Math.round((value / cur.receita) * 1000) / 10 : null,
      vsPrev: prev[d.key] !== 0 ? Math.round(((value - prev[d.key]) / Math.abs(prev[d.key])) * 1000) / 10 : null,
    };
  });
  return { cur, prev, rows };
}

export const DRE_LINE_TITLES: Record<string, string> = {
  gross_revenue: "Receita bruta e serviços", tax: "Simples Nacional (DAS)", deductions: "Cancelamentos e descontos",
  cost_of_services: "Custo dos serviços prestados", admin_expenses: "Despesas administrativas", sales_expenses: "Despesas comerciais",
  structure_expenses: "Despesas de estrutura", pro_labore: "Pró-labore", financial: "Resultado financeiro", retiradas: "Distribuição e retiradas",
};
