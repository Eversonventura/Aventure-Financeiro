-- Etapa 12: um relatório mensal por organização e mês (gerar de novo substitui o anterior).
create unique index ai_insights_monthly_uniq on ai_insights (org_id, period_month) where kind = 'monthly_report';
