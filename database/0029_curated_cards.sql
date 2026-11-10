-- 0029: Curated Design Cards live in the database (2026-11-10).
--
-- curated_collections.card (jsonb) holds what's printed on a Design Card: the front text,
-- the spec-sheet back (specs, notes, sheet box) and the drawing as an editable blueprint
-- (pieces in inches, drawn by /collections/editor/blueprint.js). The cabinet schedule on the
-- back comes from curated_collection_items, so it always matches what's sold.
--
-- Also:
--   * space allows Laundry / Closet / Office / Mudroom (curated is small spaces, not kitchens)
--   * The Denver and The Aspen are unpublished (too big / not wanted). Rows are kept.
--   * New collection 009 "Laundry is Done!" (CEO's sheet): Structure | 3, Umbra slab, Taupe.
--     Catalog stand-ins for his SKUs (Structure | 3 names):
--       W3036 -> W303613, W1836 -> W183613, W3030 -> W303013 x2,
--       SB30 sink base -> V3021 (30" 2-door vanity sink base, 21" deep: S|3 has no 30" kitchen sink base),
--       18" drawers (left) -> VDB1821-3, center 36" drawers -> VDB3621-2, right 18" drawers -> VDB1821-2
--       (his center/right bases are 28.5" high: stock is 34.5", so they are cut down; noted on the card).
--     Shelf bridge, TAG hanging rod and appliance panels are not catalog items yet.

alter table public.curated_collections add column if not exists card jsonb;

alter table public.curated_collections drop constraint if exists curated_collections_space_check;
alter table public.curated_collections add constraint curated_collections_space_check
  check (space in ('Kitchen', 'Bath', 'Laundry', 'Closet', 'Office', 'Mudroom'));

-- Same as the live view (pricing tag check from 0024) plus c.card as the last column.
create or replace view public.storefront_collections as
 select c.id as collection_id,
    c.slug,
    c.name,
    c.tagline,
    c.description,
    c.space,
    c.hero_image_url,
    c.gallery_urls,
    c.sort_order,
    s.door_style_id,
    ds.name as door_style,
    ds.code as door_style_code,
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
         then s.flat_price end::numeric(12, 2) as flat_price,
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
         then (select sum(ci.quantity::numeric * round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2))
                 from curated_collection_items ci
                 join product_prices pp on pp.product_id = ci.product_id and pp.price_code = ds.price_code
                 left join private.line_pricing lp on lp.line_id = ds.line_id
                where ci.collection_id = c.id) end as individual_price,
    (select count(*)
       from curated_collection_items ci
      where ci.collection_id = c.id and not (exists (select 1 from product_prices pp
              where pp.product_id = ci.product_id and pp.price_code = ds.price_code))) as items_not_offered,
    c.card
   from curated_collections c
     join curated_collection_styles s on s.collection_id = c.id
     join door_styles ds on ds.id = s.door_style_id and ds.is_active
  where c.is_published;

update public.curated_collections set is_published = false where slug in ('the-denver', 'the-aspen');

insert into public.curated_collections (slug, name, tagline, description, space, hero_image_url, is_published, sort_order, card)
values ('laundry-is-done', 'Laundry is Done!', 'A full laundry wall: sink, folding counter, hanging rod and storage.',
  'A 171" laundry wall: a sink base with drawers, a lower folding counter on drawers, a shelf bridge with a hanging rod, wall cabinets above and a 60" opening for a side-by-side washer and dryer. Countertop, backsplash, sink and faucet through Design Lab; washer, dryer and lighting by others.',
  'Laundry', '/Assets/Images/curated/laundry-is-done-front.webp', true, 5,
  '{"no": "009", "subtitle": "Laundry Room", "title": "LAUNDRY IS DONE!", "caption": "Structure|3 Curated Collection 009", "tag": "Designed in the Lab", "maker": "STRUCTURE|3 Cabinetry & Closets", "drawing_title": "Front Elevation", "finish": "Taupe", "mods": {"V3021": "Used as the SB30 sink base", "VDB3621-2": "Reduce height to 28.5\"", "VDB1821-2": "Reduce height to 28.5\""}, "sheet": {"sheet": "A1", "scale": "NTS", "date": "11/10/2026", "rev": "A"}, "specs": [["Construction", "0.75\" plywood frameless"], ["Drawer box", "White double-wall steel"], ["Drawer guides", "Full-extension soft close"], ["Door style", "Slab acrylic"], ["Finish", "Taupe"], ["Accessories", "TAG Hardware hanging rod"]], "notes": ["Overall width = 171\".", "Mounting height = 90\" (top of wall cabinets).", "Upper left: W3036 and W1836.", "Upper right: two W3030 cabinets.", "Center shelf bridge: 57\" wide; one open shelf with hanging rod beneath.", "Base left: SB30 sink base and 18\" drawers.", "Center base: 36\" drawers; 28.5\" high; 21\" deep.", "Right base: 18\" drawers; 28.5\" high; 21\" deep.", "Appliance opening: 60\" wide; 40.5\" high.", "See Design Lab for countertop, backsplash, sink and faucet.", "Optional sizes, materials, colors and styles available.", "By others: washer, dryer and lighting."], "blueprint": [{"id": "sink-base-sb30", "kind": "base", "name": "Sink base (SB30)", "x": 0, "y": 0, "w": 30, "h": 34.5, "d": 21, "doors": 2, "drawers": 0, "shelves": 0, "toe": 4, "crown": 0}, {"id": "left-drawers-18", "kind": "base", "name": "Left drawers (18\")", "x": 30, "y": 0, "w": 18, "h": 34.5, "d": 21, "doors": 0, "drawers": 3, "shelves": 0, "toe": 4, "crown": 0}, {"id": "sink-countertop-see-design-lab", "kind": "counter", "name": "Sink countertop (see Design Lab)", "x": 0, "y": 34.5, "w": 48, "h": 1.5, "d": 25, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "center-drawers-36", "kind": "base", "name": "Center drawers (36\")", "x": 48, "y": 0, "w": 36, "h": 28.5, "d": 21, "doors": 0, "drawers": 2, "shelves": 0, "toe": 4, "crown": 0}, {"id": "right-drawers-18", "kind": "base", "name": "Right drawers (18\")", "x": 84, "y": 0, "w": 18, "h": 28.5, "d": 21, "doors": 0, "drawers": 2, "shelves": 0, "toe": 4, "crown": 0}, {"id": "folding-top-see-design-lab", "kind": "counter", "name": "Folding top (see Design Lab)", "x": 48, "y": 28.5, "w": 54, "h": 1.5, "d": 25, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "left-appliance-panel", "kind": "filler", "name": "Left appliance panel", "x": 102, "y": 0, "w": 3, "h": 40.5, "d": 24, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "appliance-opening-washer-+-dryer-by-others", "kind": "filler", "name": "Appliance opening (washer + dryer by others)", "x": 105, "y": 0, "w": 60, "h": 40.5, "d": 24, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "right-appliance-panel", "kind": "filler", "name": "Right appliance panel", "x": 165, "y": 0, "w": 6, "h": 40.5, "d": 24, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "appliance-top", "kind": "counter", "name": "Appliance top", "x": 102, "y": 40.5, "w": 69, "h": 1.5, "d": 25, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "w3036", "kind": "wall", "name": "W3036", "x": 0, "y": 54, "w": 30, "h": 36, "d": 13, "doors": 2, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "w1836", "kind": "wall", "name": "W1836", "x": 30, "y": 54, "w": 18, "h": 36, "d": 13, "doors": 1, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "shelf-bridge", "kind": "open", "name": "Shelf bridge", "x": 48, "y": 84, "w": 57, "h": 6, "d": 13, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "hanging-rod-tag-hardware", "kind": "filler", "name": "Hanging rod (TAG Hardware)", "x": 49, "y": 79, "w": 55, "h": 1, "d": 24, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "w3030-1-of-2", "kind": "wall", "name": "W3030 (1 of 2)", "x": 105, "y": 60, "w": 30, "h": 30, "d": 13, "doors": 2, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "w3030-2-of-2", "kind": "wall", "name": "W3030 (2 of 2)", "x": 135, "y": 60, "w": 30, "h": 30, "d": 13, "doors": 2, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}]}'::jsonb);

insert into public.curated_collection_items (collection_id, product_id, quantity, sort_order)
select c.id, p.id, x.qty, x.ord
from (values ('W303613', 1, 10), ('W183613', 1, 20), ('W303013', 2, 30), ('V3021', 1, 40),
             ('VDB1821-3', 1, 50), ('VDB3621-2', 1, 60), ('VDB1821-2', 1, 70)) as x (sku, qty, ord)
join public.curated_collections c on c.slug = 'laundry-is-done'
join public.products p on p.sku = x.sku and p.vendor_id = 2;

-- Offered in Umbra (the Structure | 3 slab with Taupe). Flat price = ~10% under buying the
-- pieces one by one, ending in 9 (same rule as 0013). Prices stay hidden from the public (0023).
insert into public.curated_collection_styles (collection_id, door_style_id, flat_price)
select c.id, ds.id, floor(sum(ci.quantity * round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2)) * 0.90 / 10) * 10 - 1
from public.curated_collections c
join public.door_styles ds on ds.code = 'S3-UMBRA'
join public.curated_collection_items ci on ci.collection_id = c.id
join public.product_prices pp on pp.product_id = ci.product_id and pp.price_code = ds.price_code
join private.line_pricing lp on lp.line_id = ds.line_id
where c.slug = 'laundry-is-done'
group by c.id, ds.id;

do $$
begin
  if (select count(*) from public.curated_collection_items ci join public.curated_collections c on c.id = ci.collection_id
       where c.slug = 'laundry-is-done') <> 7 then
    raise exception 'Laundry is Done!: expected 7 item rows (a SKU did not match)';
  end if;
  if not exists (select 1 from public.curated_collection_styles s join public.curated_collections c on c.id = s.collection_id
                  where c.slug = 'laundry-is-done' and s.flat_price > 0) then
    raise exception 'Laundry is Done!: no Umbra price (missing list prices or line pricing)';
  end if;
  if exists (select 1 from public.storefront_collections where slug = 'laundry-is-done' and items_not_offered > 0) then
    raise exception 'Laundry is Done!: an item is not sold in Umbra';
  end if;
end $$;
