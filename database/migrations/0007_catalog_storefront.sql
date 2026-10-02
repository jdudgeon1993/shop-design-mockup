-- 0007_catalog_storefront.sql
-- What the DIY storefront needs on top of the catalog (0003):
--   * product_families: one site product per family (e.g. "1 Door Base Cabinet"), with sizes as options
--   * products.space: Kitchen / Bath, derived from room_type
--   * images: family photo, door style photo, finish swatch colour
--   * product_modifications: which mods apply to which products (from the spec book rules)
--   * demo retail pricing (clearly marked)
--   * views rebuilt with family, space and images

-- ---------- product families ----------
create table public.product_families (
  id           integer generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  description  text,
  room_type    text check (room_type in ('Wall', 'Base', 'Tall', 'Vanity')),
  kind         text not null,
  image_url    text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true
);
comment on table public.product_families is 'One storefront product per family; each size/variant is a row in products.';

alter table public.products add column family_id integer references public.product_families (id);
create index products_family_idx on public.products (family_id);

alter table public.products add column space text generated always as (
  case when room_type = 'Vanity' then 'Bath' when room_type is not null then 'Kitchen' end
) stored;
comment on column public.products.space is 'Kitchen or Bath (vanities and medicine cabinets are Bath). Null for parts.';

-- Families from the catalog: cabinets group by their family name; parts (fillers,
-- moldings, panels...) group by subtype so the storefront can list them by type.
insert into public.product_families (slug, name, room_type, kind, sort_order)
select
  trim(both '-' from regexp_replace(lower(fam), '[^a-z0-9]+', '-', 'g')),
  fam, min(room_type), min(kind), min(sort_order)
from (
  select coalesce(family, case subtype when 'Accessory' then 'Accessories' when 'Finish' then 'Finish Supplies'
                                   when 'Decorative' then 'Decorative Trim' else subtype || 's' end) as fam, room_type, kind, sort_order from public.products
) x
group by fam;

update public.products p
set family_id = f.id
from public.product_families f
where f.name = coalesce(p.family, case p.subtype when 'Accessory' then 'Accessories' when 'Finish' then 'Finish Supplies'
                                   when 'Decorative' then 'Decorative Trim' else p.subtype || 's' end);

alter table public.products alter column family_id set not null;

-- Placeholder photos for the demo (real product photography replaces these later).
update public.product_families
set image_url = 'https://loremflickr.com/800/600/' ||
  case when room_type = 'Vanity' then 'bathroom,vanity'
       when kind = 'cabinet' then 'kitchen,cabinets'
       else 'woodwork,interior' end
  || '?lock=' || id;

-- ---------- door style / finish visuals ----------
alter table public.door_styles add column image_url text;
alter table public.finishes add column swatch_hex text check (swatch_hex ~ '^#[0-9a-fA-F]{6}$');

update public.finishes f set swatch_hex = x.hex
from (values ('L02', '#6b6e70'), ('L03', '#a9adb0'), ('L05', '#b07a3e'), ('L10', '#f2f0eb'), ('L11', '#3b2a20'),
             ('G01', '#f7f7f5'), ('G07', '#8b5a2b'), ('G10', '#efede6'),
             ('C4', '#c49a5a'), ('D07', '#8b5a2b'), ('D10', '#f0eee8')) as x (code, hex)
where f.code = x.code;

update public.door_styles set image_url = 'https://loremflickr.com/800/600/cabinet,door?lock=' || (100 + id);

-- ---------- which mods apply to which products ----------
create table public.product_modifications (
  product_id       integer not null references public.products (id) on delete cascade,
  modification_id  smallint not null references public.modifications (id) on delete cascade,
  primary key (product_id, modification_id)
);
create index product_modifications_mod_idx on public.product_modifications (modification_id);
comment on table public.product_modifications is 'Mods a product can take. Built from modifications.applies_to (spec book rules); edit freely.';

-- Mods are priced for one line (Luxor); only link products that line actually sells.
insert into public.product_modifications (product_id, modification_id)
select p.id, m.id
from public.modifications m
join public.products p on p.kind = 'cabinet' and (
       (m.applies_to = 'Any')
    or (m.applies_to = 'Wall'        and p.room_type = 'Wall')
    or (m.applies_to = 'Tall'        and p.room_type = 'Tall')
    or (m.applies_to = 'Base'        and p.room_type = 'Base' and p.subtype is distinct from 'Drawer Base')
    or (m.applies_to = 'Drawer Base' and p.room_type = 'Base' and p.subtype = 'Drawer Base')
    or (m.applies_to ~ '^B[0-9]' and (p.sku = m.applies_to or p.sku like m.applies_to || '-%') and p.shelves = 1)
  )
where exists (
  select 1 from public.product_prices pp
  join public.price_codes pc on pc.code = pp.price_code
  where pp.product_id = p.id and pc.line_id = m.line_id
);

-- ---------- demo pricing ----------
update private.line_pricing set dealer_multiplier = 0.42, retail_multiplier = 1.80, updated_at = now();
comment on table private.line_pricing is
  'DEMO VALUES (0.42 x 1.80) set 2026-10-01 for the showcase. Replace with real multipliers. dealer cost = list x dealer_multiplier; retail = dealer cost x retail_multiplier.';

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['product_families', 'product_modifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: public read" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('create policy "%s: employees insert" on public.%I for insert to authenticated with check ((select private.is_employee()))', t, t);
    execute format('create policy "%s: employees update" on public.%I for update to authenticated using ((select private.is_employee())) with check ((select private.is_employee()))', t, t);
    execute format('create policy "%s: employees delete" on public.%I for delete to authenticated using ((select private.is_employee()))', t, t);
  end loop;
end $$;

-- ---------- rebuild views with family, space and images ----------
drop view public.storefront_variants;
drop view public.catalog_variants;
drop view private.variants_base;

create view private.variants_base as
with priced as (
  select pp.product_id, pp.price_code, pp.list_price, ds.id as door_style_id, null::smallint as upgrade_id
  from public.product_prices pp
  join public.door_styles ds on ds.price_code = pp.price_code and ds.is_active
  union all
  select pp.product_id, pp.price_code, pp.list_price, u.door_style_id, u.id
  from public.product_prices pp
  join public.upgrades u on u.price_code = pp.price_code and u.is_active
)
select
  p.id as product_id, p.sku, p.mfg_sku, p.kind, p.room_type, p.space,
  pf.id as family_id, pf.slug as family_slug, pf.name as family_name, pf.image_url as family_image_url,
  p.subtype, p.description, p.width, p.height, p.depth,
  p.doors, p.drawers, p.shelves, p.pullout_shelves, p.hinge, p.notes, p.sort_order,
  pl.id as line_id, pl.name as line_name,
  ds.id as door_style_id, ds.name as door_style, ds.code as door_style_code,
  f.id as finish_id, f.code as finish_code, f.name as finish_name, f.swatch_hex,
  u.id as upgrade_id, u.code as upgrade_code, u.name as upgrade_name,
  pr.price_code, pr.list_price,
  round(pr.list_price * lp.dealer_multiplier, 2)                         as dealer_cost,
  round(pr.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2)  as retail_price,
  concat_ws('|', p.sku, ds.code, f.code, u.code)                          as variant_key
from priced pr
join public.products p         on p.id = pr.product_id and p.is_active
join public.product_families pf on pf.id = p.family_id and pf.is_active
join public.door_styles ds     on ds.id = pr.door_style_id
join public.product_lines pl   on pl.id = ds.line_id and pl.is_active
left join public.upgrades u    on u.id = pr.upgrade_id
left join public.finishes f    on f.door_style_id = ds.id and f.is_active and p.finish_applies
left join private.line_pricing lp on lp.line_id = pl.id;
revoke all on private.variants_base from public, anon, authenticated;

create view public.catalog_variants as
select * from private.variants_base where (select private.is_employee());
comment on view public.catalog_variants is 'Employees only: every sellable variant with list, dealer cost, retail.';
revoke all on public.catalog_variants from anon;
grant select on public.catalog_variants to authenticated;

create view public.storefront_variants as
select product_id, sku, mfg_sku, kind, room_type, space, family_id, family_slug, family_name, family_image_url,
       subtype, description, width, height, depth, doors, drawers, shelves, pullout_shelves, hinge, notes, sort_order,
       line_id, line_name, door_style_id, door_style, door_style_code,
       finish_id, finish_code, finish_name, swatch_hex, upgrade_id, upgrade_code, upgrade_name,
       retail_price, variant_key
from private.variants_base;
comment on view public.storefront_variants is 'Public storefront: every sellable variant with retail price only.';
revoke all on public.storefront_variants from anon, authenticated;
grant select on public.storefront_variants to anon, authenticated;

-- Mods a product can take, with retail price (public).
create view public.storefront_product_modifications as
select pm.product_id, m.id as modification_id, m.sku, m.name, m.applies_to, m.notes, m.line_id,
       round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) as retail_price
from public.product_modifications pm
join public.modifications m on m.id = pm.modification_id and m.is_active
left join private.line_pricing lp on lp.line_id = m.line_id;
revoke all on public.storefront_product_modifications from anon, authenticated;
grant select on public.storefront_product_modifications to anon, authenticated;
