-- Etapa 10: o DRE precisa separar entradas e saídas dentro de cada linha
-- (ex.: rendimentos e tarifas no Resultado financeiro; estorno abatendo um custo).
-- As 4 primeiras colunas continuam iguais; entram income_cents e expense_cents no fim.
create or replace view v_dre_monthly with (security_invoker = true) as
select org_id, month, dre_line,
       sum(amount_cents)::bigint as amount_cents,
       sum(case when kind = 'income' then amount_cents else 0 end)::bigint as income_cents,
       sum(case when kind = 'expense' then amount_cents else 0 end)::bigint as expense_cents
from (
  select t.org_id,
         date_trunc('month', t.competence_date)::date as month,
         c.dre_line,
         t.type as kind,
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
         'expense',
         round((case when t.status = 'paid' then coalesce(t.paid_amount_cents, t.amount_cents)
                     else t.amount_cents end) * c.pj_share_pct / 100)::bigint
  from transactions t
  join entities e on e.id = t.entity_id and e.org_id = t.org_id
  join categories c on c.id = t.category_id and c.org_id = t.org_id
  where e.kind = 'shared' and t.type = 'expense' and c.pj_share_pct > 0
) x
group by org_id, month, dre_line;
