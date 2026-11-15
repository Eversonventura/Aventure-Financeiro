-- Etapa 8: guarda a sugestão da IA quando a confiança é baixa (o lançamento vai para a fila de revisão
-- sem mudar o DRE até alguém confirmar). Formato: {"entity_id","category_id","person_id","question","source"}.
alter table transactions add column ai_suggestion jsonb;
