-- Empréstimos, financiamentos e consórcios: compromissos com parcelas fixas.
-- O app gera uma transação prevista por parcela que falta (ligada por commitment_id),
-- então elas entram sozinhas no fluxo de caixa, em Contas do mês e no Início.
create type commitment_kind as enum ('loan','financing','consortium');

create table commitments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind commitment_kind not null,
  name text not null,
  entity_id uuid not null,
  institution text,
  payment_method_id uuid,
  category_id uuid,
  installment_cents bigint not null check (installment_cents > 0),
  installments smallint not null check (installments between 1 and 600),
  paid_before smallint not null default 0 check (paid_before >= 0),   -- parcelas pagas antes de cadastrar aqui
  first_due_date date not null,                                       -- vencimento da parcela 1 (mesmo que já passada)
  contracted_cents bigint check (contracted_cents >= 0),              -- valor contratado / carta de crédito
  contemplated_on date,                                               -- consórcio: data da contemplação
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  check (paid_before < installments),
  foreign key (entity_id, org_id) references entities (id, org_id),
  foreign key (payment_method_id, org_id) references payment_methods (id, org_id),
  foreign key (category_id, org_id) references categories (id, org_id)
);

alter table transactions add column commitment_id uuid references commitments(id) on delete set null;
create index on transactions (commitment_id) where commitment_id is not null;

alter table commitments enable row level security;
create policy commitments_select on commitments for select using (is_member(org_id));
create policy commitments_insert on commitments for insert with check (can_write(org_id));
create policy commitments_update on commitments for update using (can_write(org_id)) with check (can_write(org_id));
create policy commitments_delete on commitments for delete using (is_owner(org_id));
revoke all on commitments from anon;
