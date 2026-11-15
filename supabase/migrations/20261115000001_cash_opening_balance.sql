-- Etapa 6: saldo de abertura do caixa, ponto de partida do fluxo de caixa projetado.
-- Saldo em contas (R$) no fim do dia opening_balance_date. O app calcula os demais dias a partir dele.
alter table org_settings
  add column opening_balance_cents bigint not null default 0,
  add column opening_balance_date date;
