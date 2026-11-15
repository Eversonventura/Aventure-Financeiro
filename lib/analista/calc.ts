import { dreTable, type DreInput, type DreMonth } from "@/lib/dre";
import { addInvoiceMonths } from "@/lib/invoice";
import { norm } from "@/lib/sheet/extract";

export type TxRow = {
  type: "income" | "expense" | "transfer"; status: string; amount_cents: number; paid_amount_cents: number | null; competence_date: string;
  description: string; entity_id: string; person_id: string | null; category_id: string | null; payment_method_id: string | null;
};
export type CatInfo = Map<string, { name: string; nature: string | null }>;
export type Names = Map<string, string>;

export const eff = (t: Pick<TxRow, "status" | "amount_cents" | "paid_amount_cents">) => (t.status === "paid" ? t.paid_amount_cents ?? t.amount_cents : t.amount_cents);
const inMonth = (t: TxRow, month: string) => t.competence_date.slice(0, 7) === month.slice(0, 7);
const expenses = (rows: TxRow[], month: string) => rows.filter((t) => t.type === "expense" && inMonth(t, month));

export type CatSpend = { categoria: string; total_cents: number; itens: number; media_3_meses_cents: number; variacao_pct: number | null };
type Filter = { entityId?: string | null; personId?: string | null };
const pass = (t: TxRow, f: Filter) => (!f.entityId || t.entity_id === f.entityId) && (!f.personId || t.person_id === f.personId);

/** Gasto do mês por categoria, comparado à média dos 3 meses anteriores (mesmo filtro). Maior primeiro. */
export function spendByCategory(rows: TxRow[], cats: CatInfo, month: string, opts: Filter & { limit?: number } = {}): CatSpend[] {
  const sum = (m: string) => {
    const map = new Map<string, { total: number; n: number }>();
    for (const t of expenses(rows, m)) {
      if (!pass(t, opts)) continue;
      const k = t.category_id ?? "__sem";
      const cur = map.get(k) ?? { total: 0, n: 0 };
      cur.total += eff(t);
      cur.n += 1;
      map.set(k, cur);
    }
    return map;
  };
  const cur = sum(month);
  const prev = [1, 2, 3].map((n) => sum(addInvoiceMonths(month, -n)));
  const out: CatSpend[] = [...cur].map(([k, v]) => {
    const avg = Math.round(prev.reduce((s, p) => s + (p.get(k)?.total ?? 0), 0) / 3);
    return {
      categoria: k === "__sem" ? "Sem categoria" : cats.get(k)?.name ?? "—", total_cents: v.total, itens: v.n, media_3_meses_cents: avg,
      variacao_pct: avg > 0 ? Math.round(((v.total - avg) / avg) * 1000) / 10 : null,
    };
  });
  out.sort((a, b) => b.total_cents - a.total_cents);
  return out.slice(0, opts.limit ?? out.length);
}

/** Gasto do mês por entidade ou por pessoa. */
export function spendByKey(rows: TxRow[], month: string, key: "entity_id" | "person_id", names: Names): { nome: string; total_cents: number }[] {
  const map = new Map<string, number>();
  for (const t of expenses(rows, month)) {
    const k = t[key] ?? "__nenhuma";
    map.set(k, (map.get(k) ?? 0) + eff(t));
  }
  return [...map].map(([k, v]) => ({ nome: k === "__nenhuma" ? "Sem pessoa" : names.get(k) ?? "—", total_cents: v })).sort((a, b) => b.total_cents - a.total_cents);
}

export type NatureSpend = { essencial: number; importante: number; superfluo: number; sem_natureza: number };
export function spendByNature(rows: TxRow[], cats: CatInfo, month: string): NatureSpend {
  const out: NatureSpend = { essencial: 0, importante: 0, superfluo: 0, sem_natureza: 0 };
  for (const t of expenses(rows, month)) {
    const n = cats.get(t.category_id ?? "")?.nature;
    if (n === "essential") out.essencial += eff(t);
    else if (n === "important") out.importante += eff(t);
    else if (n === "superfluous") out.superfluo += eff(t);
    else out.sem_natureza += eff(t);
  }
  return out;
}

export type SubscriptionRule = { description: string; amount_cents: number; entity_id: string; payment_method_id: string | null };
export type Duplicate = { item: string; ocorrencias: number; valor_mensal_cents: number; onde: string[] };

/** A mesma assinatura cadastrada mais de uma vez (em cartões ou entidades diferentes): candidata a vazamento. */
export function findDuplicateSubscriptions(rules: SubscriptionRule[], entities: Names, methods: Names): Duplicate[] {
  const groups = new Map<string, SubscriptionRule[]>();
  for (const r of rules) {
    const k = norm(r.description);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      item: g[0].description, ocorrencias: g.length, valor_mensal_cents: g.reduce((s, r) => s + r.amount_cents, 0),
      onde: g.map((r) => `${entities.get(r.entity_id) ?? "—"}${r.payment_method_id ? ` · ${methods.get(r.payment_method_id) ?? ""}` : ""}`),
    }))
    .sort((a, b) => b.valor_mensal_cents - a.valor_mensal_cents);
}

export type Aggregates = {
  mes: string;
  dre: { mes: Record<string, number>; mes_anterior: Record<string, number>; media_3_meses: Record<string, number>; margem_contribuicao_pct: number | null; lucro_liquido_pct: number | null };
  gasto_por_categoria: CatSpend[];
  gasto_por_natureza: NatureSpend;
  gasto_por_entidade: { nome: string; total_cents: number }[];
  gasto_por_pessoa: { nome: string; total_cents: number }[];
  assinaturas_ativas: { descricao: string; valor_mensal_cents: number; entidade: string; meio: string | null }[];
  total_assinaturas_mensal_cents: number;
  possiveis_assinaturas_duplicadas: Duplicate[];
  alertas: {
    meses_negativos: { mes: string; saldo_minimo_cents: number }[];
    clientes_atrasados: { nome: string; dias: number; valor_cents: number }[];
    maior_cliente: { nome: string; pct: number } | null;
    gastos_da_aventure_fora_do_pj_cents: number;
    lancamentos_para_revisar: number;
    parcelas_de_emprestimos_e_consorcios_por_mes_cents: number;
  };
};

export type Extras = Aggregates["alertas"];

const LINES = ["receita", "das", "cancelamentos", "receitaLiquida", "custo", "margem", "administrativas", "comerciais", "estrutura", "prolabore", "resultadoOperacional", "financeiro", "lucroLiquido", "distribuicao", "caixaRetido"] as const;
const pick = (m: DreMonth): Record<string, number> => Object.fromEntries(LINES.map((k) => [k, m[k]]));

/** Os dados do mês, já resumidos, que o Claude recebe. Nunca a lista de lançamentos. */
export function buildAggregates(args: {
  month: string; dreInput: DreInput; rows: TxRow[]; cats: CatInfo; entities: Names; people: Names; methods: Names;
  rules: SubscriptionRule[]; extras: Extras;
}): Aggregates {
  const { cur, prev, rows: table } = dreTable(args.dreInput, args.month);
  const avg: Record<string, number> = Object.fromEntries(table.map((r) => [r.key, r.avg3]));
  const subs = [...args.rules].sort((a, b) => b.amount_cents - a.amount_cents);
  return {
    mes: args.month.slice(0, 7),
    dre: {
      mes: pick(cur), mes_anterior: pick(prev), media_3_meses: avg,
      margem_contribuicao_pct: cur.receita > 0 ? Math.round((cur.margem / cur.receita) * 1000) / 10 : null,
      lucro_liquido_pct: cur.receita > 0 ? Math.round((cur.lucroLiquido / cur.receita) * 1000) / 10 : null,
    },
    gasto_por_categoria: spendByCategory(args.rows, args.cats, args.month, { limit: 15 }),
    gasto_por_natureza: spendByNature(args.rows, args.cats, args.month),
    gasto_por_entidade: spendByKey(args.rows, args.month, "entity_id", args.entities),
    gasto_por_pessoa: spendByKey(args.rows, args.month, "person_id", args.people),
    assinaturas_ativas: subs.slice(0, 40).map((r) => ({ descricao: r.description, valor_mensal_cents: r.amount_cents, entidade: args.entities.get(r.entity_id) ?? "—", meio: r.payment_method_id ? args.methods.get(r.payment_method_id) ?? null : null })),
    total_assinaturas_mensal_cents: subs.reduce((s, r) => s + r.amount_cents, 0),
    possiveis_assinaturas_duplicadas: findDuplicateSubscriptions(args.rules, args.entities, args.methods),
    alertas: args.extras,
  };
}
