-- 0014_curated_anon_read.sql
-- The curated read policies called private.is_employee(), which anonymous visitors can't
-- execute (no usage on schema private), so their reads failed with "permission denied".
-- Split them: anon reads published rows only; signed-in users also see drafts if employees.

drop policy "curated_collections: public reads published" on public.curated_collections;
drop policy "curated_collection_items: public reads published" on public.curated_collection_items;
drop policy "curated_collection_styles: public reads published" on public.curated_collection_styles;

create policy "curated_collections: anon reads published" on public.curated_collections
  for select to anon using (is_published);
create policy "curated_collections: signed-in reads published or employee" on public.curated_collections
  for select to authenticated using (is_published or (select private.is_employee()));

create policy "curated_collection_items: anon reads published" on public.curated_collection_items
  for select to anon using (exists (select 1 from public.curated_collections c where c.id = collection_id and c.is_published));
create policy "curated_collection_items: signed-in reads published or employee" on public.curated_collection_items
  for select to authenticated using (exists (
    select 1 from public.curated_collections c where c.id = collection_id and (c.is_published or (select private.is_employee()))));

create policy "curated_collection_styles: anon reads published" on public.curated_collection_styles
  for select to anon using (exists (select 1 from public.curated_collections c where c.id = collection_id and c.is_published));
create policy "curated_collection_styles: signed-in reads published or employee" on public.curated_collection_styles
  for select to authenticated using (exists (
    select 1 from public.curated_collections c where c.id = collection_id and (c.is_published or (select private.is_employee()))));
