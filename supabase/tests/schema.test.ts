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
