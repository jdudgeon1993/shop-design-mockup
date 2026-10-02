-- 0012_placeholder_images.sql
-- Demo placeholder photography from Unsplash (free to use). loremflickr (0007) now requires
-- an account, so family/door-style images are re-pointed at a hand-picked set of kitchen,
-- bath and millwork photos. Replace with real product photography before launch.

create or replace function private.unsplash(p_id text, p_w int default 900)
returns text language sql immutable set search_path = '' as $$
  select 'https://images.unsplash.com/photo-' || p_id || '?w=' || p_w || '&q=70&auto=format&fit=crop';
$$;

with pools as (
  select 'kitchen' as pool, array[
    '1507089947368-19c1da9775ae', '1556909172-54557c7e4fb7', '1556909212-d5b604d0c90d', '1556911220-bff31c812dba',
    '1556912172-45b7abe8b7e1', '1565538810643-b5bdb714032a', '1588854337236-6889d631faa8', '1600489000022-c2086d79f9d4'] as ids
  union all select 'bath', array[
    '1584622650111-993a426fbf0a', '1595514535415-dae8580c416c', '1604709177225-055f99402ea3', '1620626011761-996317b8d101',
    '1552321554-5fefe8c9ef14']
  union all select 'parts', array['1556020685-ae41abfc9365', '1556909190-eccf4a8bf97a', '1581858726788-75bc0f6a952d']
)
update public.product_families f
set image_url = private.unsplash(p.ids[1 + (f.id % array_length(p.ids, 1))])
from pools p
where p.pool = case when f.room_type = 'Vanity' then 'bath' when f.kind = 'cabinet' then 'kitchen' else 'parts' end;

update public.door_styles d
set image_url = private.unsplash(x.id)
from (values ('L5P', '1600489000022-c2086d79f9d4'), ('G5P', '1507089947368-19c1da9775ae'),
             ('C5P', '1556909172-54557c7e4fb7'), ('D5P', '1556912172-45b7abe8b7e1')) as x (code, id)
where d.code = x.code;
