-- Apagar cadastros que já têm lançamentos ligados, sem perder dados e numa única operação.
-- As funções rodam com as permissões de quem chama (RLS): só o dono apaga, só da própria organização.

-- Pessoa: os registros que a citavam ficam sem pessoa. Quem tem login não pode ser apagada.
create function delete_person_safe(p_id uuid) returns void language plpgsql as $$
declare v_user uuid;
begin
  select user_id into v_user from people where id = p_id;
  if not found then raise exception 'Pessoa não encontrada.'; end if;
  if v_user is not null then raise exception 'Esta pessoa tem login no sistema e não pode ser apagada.'; end if;
  update transactions set person_id = null where person_id = p_id;
  update payment_methods set holder_person_id = null where holder_person_id = p_id;
  update classification_rules set person_id = null where person_id = p_id;
  delete from people where id = p_id;
  if not found then raise exception 'Sem permissão para apagar.'; end if;
end $$;

-- Entidade: tudo que a usava passa para outra entidade (ex.: Alexandre -> Casa).
create function delete_entity_moving(p_from uuid, p_to uuid) returns void language plpgsql as $$
declare k entity_kind;
begin
  if p_from = p_to then raise exception 'Escolha outra entidade para receber os lançamentos.'; end if;
  select kind into k from entities where id = p_from;
  if not found then raise exception 'Entidade não encontrada.'; end if;
  perform 1 from entities where id = p_to;
  if not found then raise exception 'Entidade de destino não encontrada.'; end if;
  if k = 'pj' and (select count(*) from entities where kind = 'pj') <= 1 then
    raise exception 'Não dá para apagar a única entidade da empresa (PJ).';
  end if;
  update transactions set entity_id = p_to where entity_id = p_from;
  update recurring_rules set entity_id = p_to where entity_id = p_from;
  update payment_methods set owner_entity_id = p_to where owner_entity_id = p_from;
  update people set default_entity_id = p_to where default_entity_id = p_from;
  update classification_rules set entity_id = p_to where entity_id = p_from;
  delete from entities where id = p_from;
  if not found then raise exception 'Sem permissão para apagar.'; end if;
end $$;

-- Categoria: os lançamentos ficam sem categoria e voltam para a fila de revisão.
create function delete_category_safe(p_id uuid) returns void language plpgsql as $$
begin
  perform 1 from categories where id = p_id;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  update transactions set category_id = null, needs_review = (type <> 'transfer') where category_id = p_id;
  update recurring_rules set category_id = null where category_id = p_id;
  update classification_rules set category_id = null where category_id = p_id;
  delete from classification_rules where entity_id is null and category_id is null; -- regra que ficou vazia
  delete from categories where id = p_id;
  if not found then raise exception 'Sem permissão para apagar.'; end if;
end $$;

-- Cliente: os lançamentos ficam sem cliente e as recorrências dele são desativadas (parou de cobrar).
create function delete_client_safe(p_id uuid) returns void language plpgsql as $$
begin
  perform 1 from clients where id = p_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  update transactions set client_id = null where client_id = p_id;
  update recurring_rules set client_id = null, active = false where client_id = p_id;
  delete from clients where id = p_id;
  if not found then raise exception 'Sem permissão para apagar.'; end if;
end $$;

revoke execute on function delete_person_safe(uuid), delete_entity_moving(uuid, uuid), delete_category_safe(uuid), delete_client_safe(uuid) from anon;
