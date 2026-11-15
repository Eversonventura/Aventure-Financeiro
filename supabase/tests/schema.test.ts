import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { invoiceMonthFor } from "../../lib/invoice";

const MIG = join(__dirname, "../migrations");
const U = { a: "00000000-0000-0000-0000-00000000000a", b: "00000000-0000-0000-0000-00000000000b", v: "00000000-0000-0000-0000-0000000000c1" };
const O = { a: "10000000-0000-0000-0000-00000000000a", b: "10000000-0000-0000-0000-00000000000b" };
const EA = "20000000-0000-0000-0000-00000000000a";
const EB = "20000000-0000-0000-0000-0000000000b1";
const CA = "30000000-0000-0000-0000-00000000000a";

const db = new PGlite();

async function as(user: string, sql: string) {
  await db.exec(`reset role; select set_config('app.uid','${user}',false); set role authenticated;`);
  return (await db.query<Record<string, unknown>>(sql)).rows;
}
const tx = (id: string, ent: string, org = O.a) =>
  `insert into transactions (id,org_id,type,description,amount_cents,competence_date,cash_date,entity_id)
   values ('${id}','${org}','expense','x',1,'2026-11-01','2026-11-01','${ent}')`;

beforeAll(async () => {
  // Stubs do que o Supabase já fornece (auth, storage, papéis).
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public bool);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;`);
  for (const f of readdirSync(MIG).sort()) await db.exec(readFileSync(join(MIG, f), "utf8"));
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    insert into auth.users (id) values ('${U.a}'),('${U.b}'),('${U.v}');
    insert into organizations values ('${O.a}','A',now()),('${O.b}','B',now());
    insert into memberships values ('${O.a}','${U.a}','owner'),('${O.b}','${U.b}','owner'),('${O.a}','${U.v}','viewer');
    insert into entities (id,org_id,name,kind) values ('${EA}','${O.a}','Aventure','pj'),('${EB}','${O.b}','Outra','pj');
    insert into categories (id,org_id,name,direction,dre_line) values ('${CA}','${O.a}','Receita','in','gross_revenue');
    insert into transactions (org_id,type,description,amount_cents,competence_date,cash_date,entity_id,category_id)
      values ('${O.a}','income','Cliente X',100000,'2026-11-05','2026-11-05','${EA}','${CA}');`);
});

describe("isolamento por organização (RLS)", () => {
  it("usuário de outra organização não enxerga nada", async () => {
    expect(await as(U.b, "select 1 from transactions")).toHaveLength(0);
    expect(await as(U.b, "select 1 from v_dre_monthly")).toHaveLength(0);
    expect(await as(U.b, "select name from organizations")).toEqual([{ name: "B" }]);
  });
  it("membro enxerga os dados e o DRE da própria organização", async () => {
    expect(await as(U.a, "select 1 from transactions")).toHaveLength(1);
    expect(await as(U.a, "select amount_cents::int a from v_dre_monthly")).toEqual([{ a: 100000 }]);
  });
  it("viewer lê, mas não escreve", async () => {
    expect(await as(U.v, "select 1 from transactions")).toHaveLength(1);
    await expect(as(U.v, `insert into entities (org_id,name,kind) values ('${O.a}','X','pf')`)).rejects.toThrow(/row-level security/);
  });
  it("não escreve em outra organização", async () => {
    await expect(as(U.b, `insert into entities (org_id,name,kind) values ('${O.a}','X','pf')`)).rejects.toThrow(/row-level security/);
  });
  it("não referencia entidade de outra organização (FK composta)", async () => {
    await expect(as(U.a, tx("40000000-0000-0000-0000-000000000009", EB))).rejects.toThrow(/foreign key/);
  });
  it("anon não acessa nada", async () => {
    await db.exec("reset role; set role anon");
    await expect(db.query("select 1 from transactions")).rejects.toThrow(/permission denied/);
  });
});

describe("fila offline", () => {
  it("reenviar o mesmo id não duplica", async () => {
    const id = "40000000-0000-0000-0000-000000000001";
    await as(U.a, tx(id, EA));
    await as(U.a, tx(id, EA) + " on conflict (id) do nothing");
    expect(await as(U.a, `select 1 from transactions where id='${id}'`)).toHaveLength(1);
  });
});

describe("invoice_month_for / cash_date_for", () => {
  const f = async (d: string, c: number, v: number) =>
    ((await db.query<{ m: Date }>(`select invoice_month_for('${d}',${c},${v}) m`)).rows[0].m).toISOString().slice(0, 7);
  it("Itaú (fecha 13, vence 20)", async () => {
    expect(await f("2026-11-10", 13, 20)).toBe("2026-11");
    expect(await f("2026-11-13", 13, 20)).toBe("2026-12"); // no dia do fechamento: fatura seguinte
    expect(await f("2026-11-14", 13, 20)).toBe("2026-12");
  });
  it("Alexandre (fecha 29, vence 6): vencimento no mês seguinte ao fechamento", async () => {
    expect(await f("2026-11-10", 29, 6)).toBe("2026-12");
    expect(await f("2026-11-29", 29, 6)).toBe("2027-01");
  });
  it("fechamento 31 em fevereiro vale o último dia do mês", async () => {
    expect(await f("2026-02-27", 31, 10)).toBe("2026-03");
    expect(await f("2026-02-28", 31, 10)).toBe("2026-04");
  });
  it("vencimento 31 vira o último dia do mês", async () => {
    const r = await db.query<{ d: Date }>(`select cash_date_for('2027-02-01',31) d`);
    expect(r.rows[0].d.toISOString().slice(0, 10)).toBe("2027-02-28");
  });
});

describe("paridade TypeScript x SQL (invoice_month_for)", () => {
  const combos: [number, number][] = [[13, 20], [8, 15], [18, 25], [10, 18], [29, 6], [31, 10], [30, 5], [1, 1], [15, 15]];
  it.each(combos)("fecha %i, vence %i em todas as datas de 2026 e 2027", async (closing, due) => {
    const { rows } = await db.query<{ d: string; m: string }>(
      `select to_char(d, 'YYYY-MM-DD') d, to_char(invoice_month_for(d::date, ${closing}, ${due}), 'YYYY-MM-DD') m
       from generate_series('2026-01-01'::date, '2027-12-31'::date, interval '1 day') d`);
    expect(rows).toHaveLength(730);
    for (const r of rows) expect(invoiceMonthFor(r.d, closing, due), `${r.d}`).toBe(r.m);
  });
});

describe("recorrências: gerar duas vezes não duplica", () => {
  it("a chave (org, source, external_id) ignora o segundo envio", async () => {
    const ext = "50000000-0000-4000-8000-000000000001:2026-11";
    const ins = `insert into transactions (org_id,type,status,description,amount_cents,competence_date,cash_date,entity_id,source,external_id)
      values ('${O.a}','expense','forecast','ChatGPT',10000,'2026-11-05','2026-11-05','${EA}','recurring','${ext}')
      on conflict (org_id, source, external_id) do nothing returning id`;
    expect(await as(U.a, ins)).toHaveLength(1);
    expect(await as(U.a, ins)).toHaveLength(0);
    expect(await as(U.a, `select 1 from transactions where external_id='${ext}'`)).toHaveLength(1);
  });
});

describe("views com dados: faturas, fluxo, retiradas e rateio da casa", () => {
  const E = { ve: "20000000-0000-4000-8000-0000000000c1", casa: "20000000-0000-4000-8000-0000000000c2" };
  const PM = { cartaoVe: "60000000-0000-4000-8000-000000000001", cartaoPj: "60000000-0000-4000-8000-000000000002" };
  const CAT = { casa: "30000000-0000-4000-8000-0000000000c1", mercado: "30000000-0000-4000-8000-0000000000c2" };
  const tx = (o: { type: string; cents: number; ent: string; pm?: string; cat?: string; comp: string; cash: string; inv?: string; status?: string; paid?: number }) =>
    `insert into transactions (org_id,type,status,description,amount_cents,paid_amount_cents,competence_date,cash_date,invoice_month,entity_id,payment_method_id,category_id)
     values ('${O.a}','${o.type}','${o.status ?? "pending"}','t',${o.cents},${o.paid ?? "null"},'${o.comp}','${o.cash}',${o.inv ? `'${o.inv}'` : "null"},'${o.ent}',${o.pm ? `'${o.pm}'` : "null"},${o.cat ? `'${o.cat}'` : "null"});`;

  beforeAll(async () => {
    await db.exec(`reset role;
      insert into entities (id,org_id,name,kind) values ('${E.ve}','${O.a}','Ventura','pf'),('${E.casa}','${O.a}','Casa','shared');
      insert into payment_methods (id,org_id,name,kind,owner_entity_id,closing_day,due_day) values
        ('${PM.cartaoVe}','${O.a}','Nubank Ventura','credit_card','${E.ve}',10,18),
        ('${PM.cartaoPj}','${O.a}','Cartão Asaas PJ','credit_card','${EA}',10,18);
      insert into categories (id,org_id,name,direction,dre_line,pj_share_pct) values
        ('${CAT.casa}','${O.a}','Contas da casa','out','none',30),('${CAT.mercado}','${O.a}','Mercado','out','none',0);
      ${tx({ type: "expense", cents: 10000, ent: EA, pm: PM.cartaoVe, comp: "2026-12-01", cash: "2026-12-18", inv: "2026-12-01" })}
      ${tx({ type: "expense", cents: 25000, ent: E.ve, pm: PM.cartaoVe, cat: CAT.mercado, comp: "2026-12-02", cash: "2026-12-18", inv: "2026-12-01" })}
      ${tx({ type: "income", cents: 5000, ent: E.ve, pm: PM.cartaoVe, comp: "2026-12-03", cash: "2026-12-18", inv: "2026-12-01" })}
      ${tx({ type: "expense", cents: 40000, ent: E.ve, pm: PM.cartaoPj, comp: "2026-12-04", cash: "2026-12-18", inv: "2026-12-01" })}
      ${tx({ type: "expense", cents: 100000, ent: E.casa, cat: CAT.casa, comp: "2026-12-05", cash: "2026-12-05", status: "paid", paid: 120000 })}
      ${tx({ type: "income", cents: 300000, ent: EA, comp: "2026-12-10", cash: "2026-12-10" })}`);
  });

  it("v_card_invoices: total e divisão PJ/PF da fatura (estorno abate)", async () => {
    const r = await as(U.a, `select payment_method, total_cents::int t, pj_cents::int pj, pf_cents::int pf, items from v_card_invoices where invoice_month='2026-12-01' order by payment_method`);
    expect(r).toEqual([
      { payment_method: "Cartão Asaas PJ", t: 40000, pj: 0, pf: 40000, items: 1 },
      { payment_method: "Nubank Ventura", t: 30000, pj: 10000, pf: 20000, items: 3 },
    ]);
  });
  it("v_settlements: gasto pessoal no cartão da Aventure é retirada; gasto da Aventure em cartão pessoal é reembolso", async () => {
    const r = await as(U.a, `select kind, entity_id, amount_cents::int a from v_settlements where month='2026-12-01' order by kind`);
    expect(r).toEqual([
      { kind: "reimbursement_due", entity_id: E.ve, a: 10000 },
      { kind: "withdrawal", entity_id: E.ve, a: 40000 },
    ]);
  });
  it("v_dre_monthly: o rateio da casa leva 30% para Despesas de estrutura, usando o valor real pago", async () => {
    const r = await as(U.a, `select dre_line, amount_cents::int a from v_dre_monthly where month='2026-12-01' order by dre_line`);
    expect(r).toContainEqual({ dre_line: "structure_expenses", a: 36000 }); // 30% de 120.000 (pago)
  });
  it("v_cash_flow: entradas, saídas e saldo acumulado por dia de caixa", async () => {
    const r = await as(U.a, `select to_char(cash_date,'MM-DD') d, inflow_cents::int i, outflow_cents::int o, (cumulative_net_cents - lag(cumulative_net_cents, 1, 0::numeric) over (order by cash_date))::int step
      from v_cash_flow where cash_date >= '2026-12-01' order by cash_date`);
    expect(r).toEqual([
      { d: "12-05", i: 0, o: 120000, step: expect.any(Number) },
      { d: "12-10", i: 300000, o: 0, step: expect.any(Number) },
      { d: "12-18", i: 5000, o: 75000, step: expect.any(Number) },
    ]);
    const cum = await as(U.a, `select cumulative_net_cents::int c from v_cash_flow where cash_date <= '2026-12-18' order by cash_date desc limit 1`);
    const antes = await as(U.a, `select cumulative_net_cents::int c from v_cash_flow where cash_date <= '2026-11-30' order by cash_date desc limit 1`);
    expect((cum[0].c as number) - (antes[0].c as number)).toBe(300000 + 5000 - 120000 - 75000);
  });
});

describe("classificação: regras e sugestões da IA", () => {
  const T = "70000000-0000-4000-8000-000000000001";
  it("a sugestão da IA fica guardada no lançamento (jsonb) e some quando alguém confirma", async () => {
    await db.exec(`reset role; insert into transactions (id,org_id,type,description,amount_cents,competence_date,cash_date,entity_id,needs_review,ai_confidence,ai_suggestion)
      values ('${T}','${O.a}','expense','GUARA',5000,'2026-12-01','2026-12-01','${EA}',true,0.62,'{"entity_id":"x","category_id":null,"question":"Mercado da Casa?","source":"ai"}');`);
    const r = await as(U.a, `select ai_confidence::float c, ai_suggestion->>'question' q from transactions where id='${T}'`);
    expect(r).toEqual([{ c: 0.62, q: "Mercado da Casa?" }]);
    await as(U.a, `update transactions set needs_review=false, ai_suggestion=null where id='${T}'`);
    expect(await as(U.a, `select 1 from transactions where id='${T}' and ai_suggestion is null and needs_review=false`)).toHaveLength(1);
  });
  it("regras de classificação: só a organização vê e só quem escreve cria", async () => {
    await as(U.a, `insert into classification_rules (org_id,match_text,match_kind,entity_id) values ('${O.a}','guara','contains','${EA}')`);
    expect(await as(U.a, `select 1 from classification_rules`)).toHaveLength(1);
    expect(await as(U.b, `select 1 from classification_rules`)).toHaveLength(0);
    await expect(as(U.v, `insert into classification_rules (org_id,match_text) values ('${O.a}','x')`)).rejects.toThrow(/row-level security/);
    await expect(as(U.a, `insert into classification_rules (org_id,match_text,entity_id) values ('${O.a}','y','${EB}')`)).rejects.toThrow(/foreign key/);
  });
});
