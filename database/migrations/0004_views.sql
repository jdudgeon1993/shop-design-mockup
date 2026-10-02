-- 0004_views.sql
-- private.variants_base    : every sellable combination (product x finish [+ upgrade]) with list,
--                            dealer cost and retail. Not reachable through the API.
-- catalog_variants         : all columns, returns rows ONLY for employees.
-- storefront_variants      : public-safe columns + retail price, for everyone.
-- storefront_modifications : modification options + retail price, for everyone.
--
-- The public views run with the view owner's rights on purpose (they read private pricing to
-- compute retail). storefront_* expose no list price, cost or multiplier; catalog_variants
-- filters to employees. Supabase's advisor flags these as "security definer view"; intentional.

create view private.variants_base as
with priced as (
  -- base door styles
  select pp.product_id, pp.price_code, pp.list_price, ds.id as door_style_id, null::smallint as upgrade_id
  from public.product_prices pp
  join public.door_styles ds on ds.price_code = pp.price_code and ds.is_active
  union all
  -- upgrades (e.g. Z = Luxor + 5-piece drawer front)
  select pp.product_id, pp.price_code, pp.list_price, u.door_style_id, u.id
  from public.product_prices pp
  join public.upgrades u on u.price_code = pp.price_code and u.is_active
)
select
  p.id                    as product_id,
  p.sku,
  p.mfg_sku,
  p.kind,
  p.room_type,
  p.family,
  p.subtype,
  p.description,
  p.width, p.height, p.depth,
  p.doors, p.drawers, p.shelves, p.pullout_shelves,
  p.hinge,
  p.sort_order,
  pl.id                   as line_id,
  pl.name                 as line_name,
  ds.id                   as door_style_id,
  ds.name                 as door_style,
  ds.code                 as door_style_code,
  f.id                    as finish_id,
  f.code                  as finish_code,
  f.name                  as finish_name,
  u.id                    as upgrade_id,
  u.code                  as upgrade_code,
  u.name                  as upgrade_name,
  pr.price_code,
  pr.list_price,
  round(pr.list_price * lp.dealer_multiplier, 2)                         as dealer_cost,
  round(pr.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2)  as retail_price,
  concat_ws('|', p.sku, ds.code, f.code, u.code)                          as variant_key
from priced pr
join public.products p        on p.id = pr.product_id and p.is_active
join public.door_styles ds    on ds.id = pr.door_style_id
join public.product_lines pl  on pl.id = ds.line_id and pl.is_active
left join public.upgrades u   on u.id = pr.upgrade_id
left join public.finishes f   on f.door_style_id = ds.id and f.is_active and p.finish_applies
left join private.line_pricing lp on lp.line_id = pl.id;

revoke all on private.variants_base from public, anon, authenticated;


create view public.catalog_variants as
select * from private.variants_base
where (select private.is_employee());

comment on view public.catalog_variants is
  'Employees only: every sellable product x finish (+upgrade) with list, dealer cost, retail. variant_key = sku|door style|finish|upgrade.';
revoke all on public.catalog_variants from anon;
grant select on public.catalog_variants to authenticated;


create view public.storefront_variants as
select
  product_id, sku, mfg_sku, kind, room_type, family, subtype, description,
  width, height, depth, doors, drawers, shelves, pullout_shelves, hinge, sort_order,
  line_id, line_name, door_style_id, door_style, door_style_code,
  finish_id, finish_code, finish_name, upgrade_id, upgrade_code, upgrade_name,
  retail_price, variant_key
from private.variants_base;

comment on view public.storefront_variants is
  'Public storefront: catalog variants with retail price only (null until line pricing is set).';
revoke all on public.storefront_variants from anon, authenticated;
grant select on public.storefront_variants to anon, authenticated;


create view public.storefront_modifications as
select
  m.id, m.sku, m.name, m.applies_to, m.notes,
  pl.id as line_id, pl.name as line_name,
  round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) as retail_price
from public.modifications m
join public.product_lines pl on pl.id = m.line_id
left join private.line_pricing lp on lp.line_id = pl.id
where m.is_active;

revoke all on public.storefront_modifications from anon, authenticated;
grant select on public.storefront_modifications to anon, authenticated;
