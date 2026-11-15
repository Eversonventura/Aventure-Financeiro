-- Etapa 11: integração com o Asaas.
-- asaas_events garante que o mesmo evento do webhook nunca seja processado duas vezes.
-- asaas_payments liga cada cobrança do Asaas ao lançamento que ela baixou (para não contar em dobro
-- quando chegam "confirmado" e depois "recebido", e para desfazer em caso de estorno).
create table asaas_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  event_id text not null,                       -- id do evento no Asaas (ou chave derivada)
  event text not null,                          -- ex.: PAYMENT_RECEIVED
  payment_id text,
  result text not null default 'processing',    -- processing | done | ignored | error
  detail text,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, event_id)
);

create table asaas_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  payment_id text not null,
  customer_id text,
  transaction_id uuid references transactions(id) on delete set null,
  fee_transaction_id uuid references transactions(id) on delete set null,
  value_cents bigint,
  net_cents bigint,
  status text not null,                         -- paid | refunded
  due_date date,
  paid_date date,
  prev_cash_date date,                          -- data de caixa antes da baixa (para desfazer)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, payment_id)
);
create trigger asaas_payments_updated_at before update on asaas_payments for each row execute function set_updated_at();

alter table asaas_events enable row level security;
create policy asaas_events_select on asaas_events for select using (is_member(org_id));
create policy asaas_events_insert on asaas_events for insert with check (can_write(org_id));
create policy asaas_events_update on asaas_events for update using (can_write(org_id)) with check (can_write(org_id));

alter table asaas_payments enable row level security;
create policy asaas_payments_select on asaas_payments for select using (is_member(org_id));
create policy asaas_payments_insert on asaas_payments for insert with check (can_write(org_id));
create policy asaas_payments_update on asaas_payments for update using (can_write(org_id)) with check (can_write(org_id));

revoke all on asaas_events, asaas_payments from anon;

-- um cliente do Asaas só pode estar ligado a um cliente nosso
create unique index clients_asaas_customer_uniq on clients (org_id, asaas_customer_id) where asaas_customer_id is not null;
