-- 0013_demo_collections.sql
-- Two made-up Curated Collections for the demo, built from real catalog SKUs.
-- Flat price per door style = ~10% under buying the same items individually, ending in 9.

insert into public.curated_collections (slug, name, tagline, description, space, hero_image_url, gallery_urls, is_published, sort_order)
values
  ('the-denver', 'The Denver', 'A complete L-shaped kitchen, ready to order.',
   'Everything for a classic 10'' x 12'' L-shaped kitchen: wall cabinets with a diagonal corner, a lazy susan base corner, a 36" sink base, drawer and door bases, plus the filler, crown and toe kick to finish it. Pick your door style and finish; we handle the rest.',
   'Kitchen', private.unsplash('1507089947368-19c1da9775ae', 1400),
   array[private.unsplash('1556912172-45b7abe8b7e1', 1000), private.unsplash('1565538810643-b5bdb714032a', 1000), private.unsplash('1588854337236-6889d631faa8', 1000)],
   true, 10),
  ('the-aspen', 'The Aspen', 'A furniture-style bath vanity set.',
   'A 36" vanity sink base paired with a 15" drawer bank and a matching filler: a clean, furniture-style bath wall with real storage. Pick your door style and finish.',
   'Bath', private.unsplash('1595514535415-dae8580c416c', 1400),
   array[private.unsplash('1584622650111-993a426fbf0a', 1000), private.unsplash('1604709177225-055f99402ea3', 1000)],
   true, 20);

insert into public.curated_collection_items (collection_id, product_id, quantity, sort_order)
select c.id, p.id, x.qty, x.ord
from (values
  ('the-denver', 'W3030', 2, 10), ('the-denver', 'W3630', 1, 20), ('the-denver', 'W1530-1D', 1, 30), ('the-denver', 'CW2430', 1, 40),
  ('the-denver', 'LS36R', 1, 50), ('the-denver', 'SB36', 1, 60), ('the-denver', 'DB18', 1, 70), ('the-denver', 'B15', 1, 80),
  ('the-denver', 'B24', 1, 90), ('the-denver', 'F330', 2, 100), ('the-denver', 'CRM', 3, 110), ('the-denver', 'TKS', 2, 120),
  ('the-aspen', 'V36', 1, 10), ('the-aspen', 'VDB15', 1, 20), ('the-aspen', 'F330', 1, 30)
) as x (slug, sku, qty, ord)
join public.curated_collections c on c.slug = x.slug
join public.products p on p.sku = x.sku;

insert into public.curated_collection_styles (collection_id, door_style_id, flat_price)
select c.id, d.id, 1   -- placeholder, priced below
from (values ('the-denver', 'L5P'), ('the-denver', 'G5P'), ('the-aspen', 'L5P'), ('the-aspen', 'G5P'), ('the-aspen', 'D5P')) as x (slug, code)
join public.curated_collections c on c.slug = x.slug
join public.door_styles d on d.code = x.code;

update public.curated_collection_styles s
set flat_price = floor(v.individual_price * 0.90 / 10) * 10 - 1
from public.storefront_collections v
where v.collection_id = s.collection_id and v.door_style_id = s.door_style_id;

-- Guard: every item must be sold in every door style its collection is offered in.
do $$
begin
  if exists (select 1 from public.storefront_collections where items_not_offered > 0) then
    raise exception 'A collection includes an item not offered in one of its door styles';
  end if;
  if (select count(*) from public.curated_collection_items) <> 15 then
    raise exception 'Expected 15 collection items (a SKU did not match)';
  end if;
end $$;
