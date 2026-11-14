-- Seed inicial da organização Aventure (rodar UMA vez, depois da migration).
-- Antes: crie os usuários em Authentication → Users e troque os dois e-mails abaixo.
-- Campos "a confirmar" na especificação ficam nulos e são editados em Configurações.
do $$
declare
  v_ventura_email text := 'TROQUE-PELO-EMAIL-DO-VENTURA';
  v_amanda_email  text := 'TROQUE-PELO-EMAIL-DA-AMANDA';
  v_org uuid; v_ventura uuid; v_amanda uuid;
  e_av uuid; e_ve uuid; e_am uuid; e_al uuid; e_to uuid; e_ca uuid;
  p_ve uuid; p_am uuid; p_al uuid; p_to uuid;
begin
  select id into v_ventura from auth.users where lower(email) = lower(v_ventura_email);
  select id into v_amanda  from auth.users where lower(email) = lower(v_amanda_email);
  if v_ventura is null or v_amanda is null then
    raise exception 'Usuário não encontrado: crie os dois em Authentication → Users e ajuste os e-mails.';
  end if;
  if exists (select 1 from organizations where name = 'Aventure') then
    raise exception 'Seed já aplicado (organização Aventure existe).';
  end if;

  insert into organizations (name) values ('Aventure') returning id into v_org;
  insert into memberships (org_id, user_id, role) values
    (v_org, v_ventura, 'owner'), (v_org, v_amanda, 'owner');
  insert into org_settings (org_id) values (v_org);  -- alíquota do Simples: a confirmar com a contadora

  insert into entities (org_id, name, kind) values (v_org, 'Aventure', 'pj') returning id into e_av;
  insert into entities (org_id, name, kind) values (v_org, 'Ventura', 'pf') returning id into e_ve;
  insert into entities (org_id, name, kind) values (v_org, 'Amanda', 'pf') returning id into e_am;
  insert into entities (org_id, name, kind) values (v_org, 'Alexandre', 'pf') returning id into e_al;
  insert into entities (org_id, name, kind) values (v_org, 'Toinha', 'pf') returning id into e_to;
  insert into entities (org_id, name, kind) values (v_org, 'Casa', 'shared') returning id into e_ca;

  insert into people (org_id, name, user_id, default_entity_id) values (v_org, 'Ventura', v_ventura, e_ve) returning id into p_ve;
  insert into people (org_id, name, user_id, default_entity_id) values (v_org, 'Amanda', v_amanda, e_am) returning id into p_am;
  insert into people (org_id, name, default_entity_id) values (v_org, 'Alexandre', e_al) returning id into p_al;
  insert into people (org_id, name, default_entity_id) values (v_org, 'Toinha', e_to) returning id into p_to;

  -- owner_entity_id provisório onde o titular está "a confirmar": Casa (neutro para retiradas)
  insert into payment_methods (org_id, name, kind, holder_person_id, owner_entity_id, closing_day, due_day, credit_limit_cents) values
    (v_org, 'Cartão Itaú',            'credit_card', null, e_ca, 13, 20, null),
    (v_org, 'Nubank Amanda',          'credit_card', p_am, e_am,  8, 15, 30000),
    (v_org, 'Cartão R$ 300 (vence 25)','credit_card', null, e_ca, 18, 25, 30000),
    (v_org, 'Nubank Ventura',         'credit_card', p_ve, e_ve, 10, 18, null),
    (v_org, 'Cartão Alexandre',       'credit_card', p_al, e_al, 29,  6, null),
    (v_org, 'Cartão Toinha',          'credit_card', p_to, e_to, null, null, null),
    (v_org, 'Cartão Asaas PJ',        'credit_card', null, e_av, null, null, null),
    (v_org, 'Conta Asaas PJ',         'bank_account', null, e_av, null, null, null);

  -- Plano de categorias (seção 5): nome, entidade, direção, linha do DRE, natureza
  insert into categories (org_id, name, applies_to, direction, dre_line, nature) values
    (v_org, 'Mensalidade de cliente', 'pj', 'in',  'gross_revenue', null),
    (v_org, 'Projeto / parcela de projeto', 'pj', 'in', 'gross_revenue', null),
    (v_org, 'Cancelamentos e descontos', 'pj', 'out', 'deductions', null),
    (v_org, 'Equipe e freelancers', 'pj', 'out', 'cost_of_services', 'essential'),
    (v_org, 'Ferramentas de produção', 'pj', 'out', 'cost_of_services', 'important'),
    (v_org, 'Contabilidade e fiscal', 'pj', 'out', 'admin_expenses', 'essential'),
    (v_org, 'Sistemas e fornecedores', 'pj', 'out', 'admin_expenses', 'important'),
    (v_org, 'Marketing próprio', 'pj', 'out', 'sales_expenses', 'important'),
    (v_org, 'Impostos (DAS)', 'pj', 'out', 'tax', 'essential'),
    (v_org, 'Pró-labore', 'pj', 'out', 'pro_labore', null),
    (v_org, 'Distribuição de lucros', 'pj', 'out', 'distribution', null),
    (v_org, 'Tarifas e juros', null, 'out', 'financial', 'important'),
    (v_org, 'Moradia (condomínio, financiamento, construtora)', 'pf', 'out', 'none', 'essential'),
    (v_org, 'Contas da casa (energia, internet, telefone)', 'pf', 'out', 'none', 'essential'),
    (v_org, 'Educação', 'pf', 'out', 'none', 'essential'),
    (v_org, 'Mercado', 'pf', 'out', 'none', 'essential'),
    (v_org, 'Delivery e restaurantes', 'pf', 'out', 'none', 'superfluous'),
    (v_org, 'Transporte e carro', 'pf', 'out', 'none', 'important'),
    (v_org, 'Saúde e farmácia', 'pf', 'out', 'none', 'essential'),
    (v_org, 'Compras pessoais (roupas, beleza, lojas)', 'pf', 'out', 'none', 'superfluous'),
    (v_org, 'Eletrônicos', 'pf', 'out', 'none', 'important'),
    (v_org, 'Assinaturas pessoais', 'pf', 'out', 'none', 'superfluous'),
    (v_org, 'Pets', 'pf', 'out', 'none', 'important'),
    (v_org, 'Lazer e presentes', 'pf', 'out', 'none', 'superfluous'),
    (v_org, 'Empréstimos e financiamentos', 'pf', 'out', 'none', 'essential'),
    (v_org, 'Serviços domésticos', 'pf', 'out', 'none', 'important'),
    (v_org, 'Salário e outras rendas', 'pf', 'in', 'none', null),
    (v_org, 'Outros (despesa)', null, 'out', 'admin_expenses', null),
    (v_org, 'Outros (entrada)', null, 'in', 'none', null);
  -- Rateio da casa (pj_share_pct) fica em 0 até vocês definirem o percentual.
end $$;
