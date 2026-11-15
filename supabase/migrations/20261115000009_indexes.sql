-- Revisão geral: índices que faltavam. Sem eles, cada apagar/atualizar que toca uma chave estrangeira
-- e cada consulta por organização, meio, categoria ou cliente lê a tabela inteira. Com poucos dados não se nota;
-- com um ano de lançamentos (e na V3, com várias organizações) pesa.

-- consultas por organização (a RLS filtra por org_id em todas as tabelas)
create index if not exists entities_org_idx on entities (org_id);
create index if not exists people_org_idx on people (org_id);
create index if not exists payment_methods_org_idx on payment_methods (org_id);
create index if not exists categories_org_idx on categories (org_id);
create index if not exists clients_org_idx on clients (org_id);
create index if not exists recurring_rules_org_idx on recurring_rules (org_id);
create index if not exists installment_groups_org_idx on installment_groups (org_id);
create index if not exists classification_rules_org_idx on classification_rules (org_id);
create index if not exists imports_org_idx on imports (org_id, created_at desc);
create index if not exists commitments_org_idx on commitments (org_id);
create index if not exists memberships_user_idx on memberships (user_id);

-- lançamentos: telas de Cartões, conferência de fatura, Clientes, Painel e apagar cadastros
create index if not exists transactions_card_invoice_idx on transactions (org_id, payment_method_id, invoice_month) where payment_method_id is not null;
create index if not exists transactions_client_idx on transactions (org_id, client_id) where client_id is not null;
create index if not exists transactions_category_idx on transactions (category_id) where category_id is not null;
create index if not exists transactions_entity_idx on transactions (entity_id);
create index if not exists transactions_person_idx on transactions (person_id) where person_id is not null;
create index if not exists transactions_group_idx on transactions (installment_group_id) where installment_group_id is not null;
create index if not exists transactions_rule_idx on transactions (recurring_rule_id) where recurring_rule_id is not null;
create index if not exists transactions_method_idx on transactions (payment_method_id) where payment_method_id is not null;

-- chaves estrangeiras das demais tabelas
create index if not exists recurring_rules_entity_idx on recurring_rules (entity_id);
create index if not exists recurring_rules_client_idx on recurring_rules (client_id) where client_id is not null;
create index if not exists recurring_rules_category_idx on recurring_rules (category_id) where category_id is not null;
create index if not exists recurring_rules_method_idx on recurring_rules (payment_method_id) where payment_method_id is not null;
create index if not exists installment_groups_method_idx on installment_groups (payment_method_id);
create index if not exists payment_methods_owner_idx on payment_methods (owner_entity_id);
create index if not exists payment_methods_holder_idx on payment_methods (holder_person_id) where holder_person_id is not null;
create index if not exists classification_rules_entity_idx on classification_rules (entity_id) where entity_id is not null;
create index if not exists classification_rules_category_idx on classification_rules (category_id) where category_id is not null;
create index if not exists commitments_entity_idx on commitments (entity_id);
create index if not exists asaas_payments_tx_idx on asaas_payments (transaction_id) where transaction_id is not null;
