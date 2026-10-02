-- 0011_storefront_offers.sql
-- Compact storefront pricing: one row per product x door style (x upgrade) with the retail
-- price. Finishes don't change price, so the site combines this with the public finishes
-- table instead of downloading every product x finish row (~1.7k rows instead of ~4k).

create view public.storefront_offers as
select pp.product_id, ds.id as door_style_id, null::smallint as upgrade_id,
       round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) as retail_price
from public.product_prices pp
join public.products p on p.id = pp.product_id and p.is_active
join public.door_styles ds on ds.price_code = pp.price_code and ds.is_active
left join private.line_pricing lp on lp.line_id = ds.line_id
union all
select pp.product_id, u.door_style_id, u.id,
       round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2)
from public.product_prices pp
join public.products p on p.id = pp.product_id and p.is_active
join public.upgrades u on u.price_code = pp.price_code and u.is_active
join public.door_styles ds on ds.id = u.door_style_id and ds.is_active
left join private.line_pricing lp on lp.line_id = ds.line_id;

comment on view public.storefront_offers is 'Retail price per product x door style (upgrade_id set for upgrade prices, e.g. 5P). Combine with finishes for the full option list.';
revoke all on public.storefront_offers from anon, authenticated;
grant select on public.storefront_offers to anon, authenticated;
