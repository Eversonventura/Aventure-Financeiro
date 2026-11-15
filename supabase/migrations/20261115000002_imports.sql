-- Etapa 7: importação da planilha atual.
-- Guarda o arquivo (bucket privado), o mapa do layout e liga cada registro importado à importação,
-- para permitir desfazer a importação inteira.
alter table imports
  add column original_name text,
  add column layout jsonb;

alter table transactions add column import_id uuid references imports(id) on delete set null;
alter table installment_groups add column import_id uuid references imports(id) on delete set null;
alter table recurring_rules add column import_id uuid references imports(id) on delete set null;
create index on transactions (import_id) where import_id is not null;

insert into storage.buckets (id, name, public) values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy imports_files_select on storage.objects for select
  using (bucket_id = 'imports' and is_member(((storage.foldername(name))[1])::uuid));
create policy imports_files_insert on storage.objects for insert
  with check (bucket_id = 'imports' and can_write(((storage.foldername(name))[1])::uuid));
create policy imports_files_delete on storage.objects for delete
  using (bucket_id = 'imports' and is_owner(((storage.foldername(name))[1])::uuid));
