-- Caixa Aventure — migration inicial (etapa 2)
-- Base: docs/ESPECIFICACAO.md seção 7, com estas correções:
--  * RLS por papel (viewer só lê; bpo_analyst/editor escrevem; só owner apaga)
--  * FKs compostas (id, org_id): nenhum registro aponta para dados de outra organização
--  * views com security_invoker = true (respeitam a RLS)
--  * funções de fatura com fechamento 29/30/31 ajustado ao último dia do mês

-- ===== Organização e acesso =====
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type member_role as enum ('owner','editor','viewer','bpo_analyst');
create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'owner',
  primary key (org_id, user_id)
);

create function is_member(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = o and m.user_id = auth.uid());
$$;

create function can_write(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = o and m.user_id = auth.uid()
      and m.role in ('owner','editor','bpo_analyst')
  );
$$;

create function is_owner(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = o and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== Cadastros =====
-- Cada tabela tem unique (id, org_id) para permitir FKs compostas.
create type entity_kind as enum ('pj','pf','shared');
create table entities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,                -- Aventure, Ventura, Amanda, Alexandre, Toinha, Casa
  kind entity_kind not null,
  document text,                     -- CNPJ/CPF opcional
  unique (id, org_id)
);

create table people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  user_id uuid references auth.users(id),  -- null para Alexandre e Toinha
  default_entity_id uuid,
  unique (id, org_id),
  foreign key (default_entity_id, org_id) references entities (id, org_id)
);

create type pm_kind as enum ('credit_card','bank_account','pix','cash');
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind pm_kind not null,
  holder_person_id uuid,
  owner_entity_id uuid not null,     -- de quem é o dinheiro que paga este meio
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  credit_limit_cents bigint,
  active boolean not null default true,
  unique (id, org_id),
  foreign key (holder_person_id, org_id) references people (id, org_id),
  foreign key (owner_entity_id, org_id) references entities (id, org_id)
);

create type dre_line as enum (
  'gross_revenue','tax','deductions','cost_of_services','admin_expenses',
  'sales_expenses','structure_expenses','pro_labore','financial','distribution','none'
);
create type category_nature as enum ('essential','important','superfluous');
create table categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  applies_to entity_kind,            -- null = ambas
  direction text not null check (direction in ('in','out')),
  dre_line dre_line not null default 'none',
  nature category_nature,
  pj_share_pct numeric(5,2) not null default 0 check (pj_share_pct between 0 and 100),
  unique (id, org_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  document text,
  asaas_customer_id text,
  active boolean not null default true,
  unique (id, org_id)
);

-- ===== Regras que geram lançamentos =====
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  start_month date not null check (extract(day from start_month) = 1),
  end_month date,                    -- null = sem fim
  entity_id uuid not null,
  category_id uuid,
  payment_method_id uuid,
  client_id uuid,
  active boolean not null default true,
  unique (id, org_id),
  foreign key (entity_id, org_id) references entities (id, org_id),
  foreign key (category_id, org_id) references categories (id, org_id),
  foreign key (payment_method_id, org_id) references payment_methods (id, org_id),
  foreign key (client_id, org_id) references clients (id, org_id)
);

create table installment_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  description text not null,
  installment_cents bigint not null check (installment_cents >= 0),
  installments smallint not null check (installments >= 1),
  purchase_date date,
  first_invoice_month date not null,
  payment_method_id uuid not null,
  unique (id, org_id),
  foreign key (payment_method_id, org_id) references payment_methods (id, org_id)
);

-- ===== Movimentos =====
create type tx_type as enum ('expense','income','transfer');
create type tx_status as enum ('forecast','pending','paid');
create type tx_source as enum
  ('manual','voice','photo','import_sheet','import_invoice','asaas','recurring');
create table transactions (
  -- id pode ser gerado no cliente (fila offline): reenviar o mesmo id não duplica.
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type tx_type not null,
  status tx_status not null default 'pending',
  description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  paid_amount_cents bigint check (paid_amount_cents >= 0),
  competence_date date not null,     -- DRE
  cash_date date not null,           -- fluxo de caixa
  invoice_month date,                -- fatura do cartão (dia 1 do mês de vencimento)
  entity_id uuid not null,
  person_id uuid,
  payment_method_id uuid,
  category_id uuid,
  client_id uuid,
  installment_group_id uuid,
  installment_number smallint,
  recurring_rule_id uuid,
  transfer_pair_id uuid,             -- liga as duas pernas de uma transferência
  source tx_source not null default 'manual',
  external_id text,                  -- id do Asaas, linha da fatura, linha da planilha
  ai_confidence numeric(3,2),
  needs_review boolean not null default false,
  receipt_path text,                 -- Storage: receipts/{org_id}/{id}.jpg
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source, external_id),
  foreign key (entity_id, org_id) references entities (id, org_id),
  foreign key (person_id, org_id) references people (id, org_id),
  foreign key (payment_method_id, org_id) references payment_methods (id, org_id),
  foreign key (category_id, org_id) references categories (id, org_id),
  foreign key (client_id, org_id) references clients (id, org_id),
  foreign key (installment_group_id, org_id) references installment_groups (id, org_id) on delete cascade,
  foreign key (recurring_rule_id, org_id) references recurring_rules (id, org_id)
);
create index on transactions (org_id, competence_date);
create index on transactions (org_id, cash_date);
create index on transactions (org_id, needs_review) where needs_review;
create trigger transactions_updated_at before update on transactions
  for each row execute function set_updated_at();

-- ===== Aprendizado e importação =====
create table classification_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  match_text text not null,          -- normalizado: minúsculo, sem acento
  match_kind text not null default 'contains' check (match_kind in ('contains','equals')),
  payment_method_id uuid,            -- regra só para um meio (opcional)
  entity_id uuid,
  category_id uuid,
  person_id uuid,
  hits int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (payment_method_id, org_id) references payment_methods (id, org_id),
  foreign key (entity_id, org_id) references entities (id, org_id),
  foreign key (category_id, org_id) references categories (id, org_id),
  foreign key (person_id, org_id) references people (id, org_id)
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('sheet','invoice_pdf','invoice_csv','ofx')),
  file_path text not null,
  status text not null default 'processing',
  stats jsonb,                       -- {total, ok, review, duplicate}
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table org_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  tax_regime text not null default 'simples_nacional',
  simples_effective_rate numeric(5,4),   -- ex.: 0.0600
  timezone text not null default 'America/Fortaleza'
);

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  period_month date not null,
  kind text not null check (kind in ('monthly_report','alert')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

-- ===== RLS =====
alter table organizations enable row level security;
create policy org_select on organizations for select using (is_member(id));

alter table memberships enable row level security;
-- cada membro vê os membros da própria organização; escrita só pelo servidor (service role)
create policy memberships_select on memberships for select using (is_member(org_id));

do $$
declare t text;
begin
  foreach t in array array[
    'entities','people','payment_methods','categories','clients',
    'recurring_rules','installment_groups','transactions',
    'classification_rules','imports','org_settings','ai_insights'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_member(org_id))', t||'_select', t);
    execute format('create policy %I on %I for insert with check (can_write(org_id))', t||'_insert', t);
    execute format('create policy %I on %I for update using (can_write(org_id)) with check (can_write(org_id))', t||'_update', t);
    execute format('create policy %I on %I for delete using (is_owner(org_id))', t||'_delete', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;

-- ===== Funções de fatura =====
-- Compra no dia do fechamento (ou depois) cai na fatura seguinte.
-- Se o vencimento é <= fechamento, o vencimento é no mês seguinte ao do fechamento.
-- Fechamento 29/30/31 vale o último dia do mês quando o mês é mais curto.
-- Retorna o dia 1 do mês de vencimento.
create function invoice_month_for(purchase_date date, closing_day int, due_day int)
returns date language sql immutable as $$
  select (
    date_trunc('month', purchase_date)
    + (
        (case when extract(day from purchase_date)::int >=
                   least(closing_day,
                         extract(day from (date_trunc('month', purchase_date) + interval '1 month - 1 day'))::int)
              then 1 else 0 end)
      + (case when due_day <= closing_day then 1 else 0 end)
      ) * interval '1 month'
  )::date;
$$;

-- Data de vencimento da fatura (vencimento 31 vira o último dia do mês).
create function cash_date_for(invoice_month date, due_day int)
returns date language sql immutable as $$
  select (
    invoice_month
    + (least(due_day,
             extract(day from (invoice_month + interval '1 month - 1 day'))::int) - 1)
  )::date;
$$;

-- ===== Views (security_invoker: respeitam a RLS do usuário) =====
-- Valor efetivo: o real quando pago, o previsto nos demais casos.
create view v_dre_monthly with (security_invoker = true) as
select org_id, month, dre_line, sum(amount_cents)::bigint as amount_cents
from (
  select t.org_id,
         date_trunc('month', t.competence_date)::date as month,
         c.dre_line,
         case when t.status = 'paid' then coalesce(t.paid_amount_cents, t.amount_cents)
              else t.amount_cents end as amount_cents
  from transactions t
  join entities e on e.id = t.entity_id and e.org_id = t.org_id
  join categories c on c.id = t.category_id and c.org_id = t.org_id
  where e.kind = 'pj' and t.type in ('income','expense') and c.dre_line <> 'none'
  union all
  -- rateio da casa: parte da Aventure entra em Despesas de estrutura
  select t.org_id,
         date_trunc('month', t.competence_date)::date,
         'structure_expenses'::dre_line,
         round((case when t.status = 'paid' then coalesce(t.paid_amount_cents, t.amount_cents)
                     else t.amount_cents end) * c.pj_share_pct / 100)::bigint
  from transactions t
  join entities e on e.id = t.entity_id and e.org_id = t.org_id
  join categories c on c.id = t.category_id and c.org_id = t.org_id
  where e.kind = 'shared' and t.type = 'expense' and c.pj_share_pct > 0
) x
group by org_id, month, dre_line;

create view v_cash_flow with (security_invoker = true) as
with daily as (
  select t.org_id, t.cash_date,
    sum(case when t.type = 'income' then eff else 0 end)::bigint as inflow_cents,
    sum(case when t.type = 'expense' then eff else 0 end)::bigint as outflow_cents,
    sum(case when t.status = 'paid' then (case when t.type = 'income' then eff else -eff end) else 0 end)::bigint as realized_net_cents
  from (
    select *, case when status = 'paid' then coalesce(paid_amount_cents, amount_cents)
                   else amount_cents end as eff
    from transactions where type in ('income','expense')
  ) t
  group by t.org_id, t.cash_date
)
select org_id, cash_date, inflow_cents, outflow_cents,
       (inflow_cents - outflow_cents) as net_cents,
       realized_net_cents,
       sum(inflow_cents - outflow_cents) over w as cumulative_net_cents,
       sum(realized_net_cents) over w as cumulative_realized_cents
from daily
window w as (partition by org_id order by cash_date);

create view v_card_invoices with (security_invoker = true) as
select t.org_id, pm.id as payment_method_id, pm.name as payment_method, t.invoice_month,
  sum(eff)::bigint as total_cents,
  sum(case when e.kind = 'pj' then eff else 0 end)::bigint as pj_cents,
  sum(case when e.kind <> 'pj' then eff else 0 end)::bigint as pf_cents,
  count(*)::int as items
from (
  select *, (case when status = 'paid' then coalesce(paid_amount_cents, amount_cents)
                  else amount_cents end) * (case when type = 'income' then -1 else 1 end) as eff
  from transactions where type in ('expense','income')
) t
join payment_methods pm on pm.id = t.payment_method_id and pm.org_id = t.org_id
join entities e on e.id = t.entity_id and e.org_id = t.org_id
where pm.kind = 'credit_card' and t.invoice_month is not null
group by t.org_id, pm.id, pm.name, t.invoice_month;

-- Retiradas: gasto de pessoa física/casa pago por meio da Aventure.
-- Reembolso devido: gasto da Aventure pago por meio de pessoa física/casa.
create view v_settlements with (security_invoker = true) as
select t.org_id, date_trunc('month', t.competence_date)::date as month,
       case when e.kind <> 'pj' then 'withdrawal' else 'reimbursement_due' end as kind,
       case when e.kind <> 'pj' then t.entity_id else pm.owner_entity_id end as entity_id,
       sum(case when t.status = 'paid' then coalesce(t.paid_amount_cents, t.amount_cents)
                else t.amount_cents end)::bigint as amount_cents
from transactions t
join entities e on e.id = t.entity_id and e.org_id = t.org_id
join payment_methods pm on pm.id = t.payment_method_id and pm.org_id = t.org_id
join entities pe on pe.id = pm.owner_entity_id and pe.org_id = pm.org_id
where t.type = 'expense'
  and ((e.kind <> 'pj' and pe.kind = 'pj') or (e.kind = 'pj' and pe.kind <> 'pj'))
group by 1, 2, 3, 4;

create view v_people_spend with (security_invoker = true) as
select t.org_id, date_trunc('month', t.competence_date)::date as month,
       t.person_id, t.entity_id, t.category_id,
       sum(case when t.status = 'paid' then coalesce(t.paid_amount_cents, t.amount_cents)
                else t.amount_cents end)::bigint as amount_cents
from transactions t
where t.type = 'expense'
group by 1, 2, 3, 4, 5;

-- ===== Storage: fotos de cupom em bucket privado, uma pasta por organização =====
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select
  using (bucket_id = 'receipts' and is_member(((storage.foldername(name))[1])::uuid));
create policy receipts_insert on storage.objects for insert
  with check (bucket_id = 'receipts' and can_write(((storage.foldername(name))[1])::uuid));
create policy receipts_update on storage.objects for update
  using (bucket_id = 'receipts' and can_write(((storage.foldername(name))[1])::uuid));
create policy receipts_delete on storage.objects for delete
  using (bucket_id = 'receipts' and is_owner(((storage.foldername(name))[1])::uuid));
