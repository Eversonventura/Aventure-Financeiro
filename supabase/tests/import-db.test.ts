import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawItem } from "../../lib/sheet/extract";
import { buildPlan, fingerprint, type PmInfo } from "../../lib/sheet/plan";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = ID(1000), IMP = ID(2000);
const E = { av: ID(1), casa: ID(2) };
const itau: PmInfo = { id: ID(10), name: "Cartão Itaú", kind: "credit_card", owner_entity_id: E.casa, holder_person_id: null, closing_day: 13, due_day: 20 };
const db = new PGlite();

const raw = (o: Partial<RawItem>): RawItem => ({ regionId: "r", kind: "card_purchases", month: "2026-11", cardId: itau.id, row: 2, description: "X", amountCents: 100, date: null, day: null, ...o });
const items: RawItem[] = [
  raw({ description: "MACBOOK 11/12", amountCents: 120000 }), raw({ month: "2026-12", description: "MACBOOK 12/12", amountCents: 120000 }),
  ...["2026-11", "2026-12", "2027-01"].map((m) => raw({ month: m, description: "CANVA", amountCents: 4990 })),
  raw({ description: "UBER", amountCents: 2500 }),
  ...["2026-11", "2026-12"].map((m) => raw({ kind: "monthly_bills", cardId: null, month: m, description: "Condomínio", amountCents: 85000, day: 10 })),
  ...["2026-11", "2026-12"].map((m) => raw({ kind: "income", cardId: null, month: m, description: "SR Tecnologia", amountCents: 250000, day: 5 })),
];
const plan = () => buildPlan(items, [], {
  today: "2026-11-14", methods: [itau],
  entities: [{ id: E.av, name: "Aventure", kind: "pj" }, { id: E.casa, name: "Casa", kind: "shared" }],
  clients: [{ id: ID(30), name: "SR Tecnologia" }], existingKeys: new Set(), existingFingerprints: new Set(), existingRules: [],
});

const insert = (table: string, rows: object[]) => {
  const cols = Object.keys(rows[0]).map((c) => `"${c}"`).join(", "); // só as colunas do plano: o resto usa o padrão do banco
  return db.query(`insert into ${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::${table}, $1::jsonb)`, [JSON.stringify(rows)]);
};

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public bool);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;`);
  const dir = join(__dirname, "../migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.exec(`
    insert into organizations values ('${O}','A',now());
    insert into entities (id,org_id,name,kind) values ('${E.av}','${O}','Aventure','pj'),('${E.casa}','${O}','Casa','shared');
    insert into payment_methods (id,org_id,name,kind,owner_entity_id,closing_day,due_day) values ('${itau.id}','${O}','Cartão Itaú','credit_card','${E.casa}',13,20);
    insert into clients (id,org_id,name) values ('${ID(30)}','${O}','SR Tecnologia');
    insert into imports (id,org_id,kind,file_path) values ('${IMP}','${O}','sheet','${O}/${IMP}.xlsx');`);
});

describe("o plano da importação é aceito pelo banco", () => {
  it("grava grupos, regras e lançamentos com as chaves estrangeiras e enums do schema", async () => {
    const p = plan();
    const withOrg = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, org_id: O, import_id: IMP }));
    await insert("installment_groups", withOrg(p.groups));
    await insert("recurring_rules", withOrg(p.rules));
    await insert("transactions", withOrg(p.txs));
    const n = (await db.query<{ n: number }>(`select count(*)::int n from transactions where import_id='${IMP}'`)).rows[0].n;
    expect(n).toBe(p.txs.length);
    expect(p.groups).toHaveLength(1);
    expect(p.rules.map((r) => r.description).sort()).toEqual(["CANVA", "Condomínio", "SR Tecnologia"]);
    const parcelas = (await db.query<{ n: number }>(`select count(*)::int n from transactions where installment_group_id='${p.groups[0].id}'`)).rows[0].n;
    expect(parcelas).toBe(12);
  });

  it("a chave do cron (regra:mês) já existe para os meses importados: o cron não duplica", async () => {
    const rule = (await db.query<{ id: string }>(`select id from recurring_rules where description='CANVA'`)).rows[0].id;
    const r = await db.query(`insert into transactions (org_id,type,description,amount_cents,competence_date,cash_date,entity_id,source,external_id)
      values ('${O}','expense','CANVA',4990,'2026-11-01','2026-11-20','${E.casa}','recurring','${rule}:2026-11') on conflict (org_id, source, external_id) do nothing returning id`);
    expect(r.rows).toHaveLength(0);
  });

  it("reimportar: as impressões digitais acusam tudo como duplicado", async () => {
    const { rows } = await db.query<{ description: string; amount_cents: number; cash_date: string; payment_method_id: string | null }>(
      `select description, amount_cents::int amount_cents, to_char(cash_date,'YYYY-MM-DD') cash_date, payment_method_id from transactions where import_id='${IMP}'`);
    const again = buildPlan(items, [], {
      today: "2026-11-14", methods: [itau],
      entities: [{ id: E.av, name: "Aventure", kind: "pj" }, { id: E.casa, name: "Casa", kind: "shared" }],
      clients: [], existingKeys: new Set(), existingFingerprints: new Set(rows.map(fingerprint)),
      existingRules: (await db.query<{ description: string; direction: "in" | "out"; payment_method_id: string | null }>(`select description, direction, payment_method_id from recurring_rules`)).rows,
    });
    expect(again.txs).toHaveLength(0);
    expect(again.stats.duplicate).toBe(rows.length);
  });

  it("desfazer: apaga o que a importação criou, mesmo com lançamentos gerados depois pelo cron", async () => {
    const rule = (await db.query<{ id: string }>(`select id from recurring_rules where description='CANVA'`)).rows[0].id;
    await db.exec(`insert into transactions (org_id,type,status,description,amount_cents,competence_date,cash_date,entity_id,source,external_id,recurring_rule_id)
      values ('${O}','expense','forecast','CANVA',4990,'2027-02-01','2027-02-20','${E.casa}','recurring','${rule}:2027-02','${rule}')`);
    // mesma ordem do undoImport
    await db.exec(`delete from transactions where import_id='${IMP}';
      delete from installment_groups where import_id='${IMP}';
      update transactions set recurring_rule_id = null where recurring_rule_id in (select id from recurring_rules where import_id='${IMP}');
      delete from recurring_rules where import_id='${IMP}';`);
    expect((await db.query<{ n: number }>(`select count(*)::int n from transactions where import_id='${IMP}'`)).rows[0].n).toBe(0);
    expect((await db.query<{ n: number }>(`select count(*)::int n from recurring_rules`)).rows[0].n).toBe(0);
    expect((await db.query<{ n: number }>(`select count(*)::int n from transactions`)).rows[0].n).toBe(1); // o gerado pelo cron fica, sem regra
  });
});
