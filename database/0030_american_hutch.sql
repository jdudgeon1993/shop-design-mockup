-- 0030: The American Hutch (Curated No. 008): Structure | 3 American Shaker (2026-11-10).
--
-- Nextar's American (framed shaker) series, sold as Structure | 3. Spec + colours from the
-- CEO's "DIY LINE UP - FIRST RELEASE" (10-21-2026): 3" shaker, 5-pc drawer front, HDF,
-- framed 1/4" reveal (full overlay), 1/2" plywood box, white melamine interior; drawer
-- box / guides / hinges "confirm with Ed". Prices come from the
-- CEO's Nextar American price list and live in the private seed (this repo is public),
-- Design Labs/database/seed/0002_nextar_american.sql: run it right after this file. Framed spec from Nextar's
-- Door name (Loveland) from the CEO's email. Colours D.L. will offer: White, Green, Blue paint.
--
-- Only the Hutch's 4 pieces are loaded for now; they stay is_active = false so the DIY
-- Shop doesn't show a 4-piece line (the collections page reads them by id). The full
-- American list can be loaded later.
--
-- Also: a collection's flat price may be NULL (= coming soon) and place_order() refuses one.

alter table public.curated_collections drop constraint if exists curated_collections_space_check;
alter table public.curated_collections add constraint curated_collections_space_check
  check (space in ('Kitchen', 'Bath', 'Laundry', 'Closet', 'Office', 'Mudroom', 'Dining'));

alter table public.curated_collection_styles alter column flat_price drop not null;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.place_order'::regproc);
  if position('v_price := r.flat_price;' in d) = 0 then raise exception 'place_order changed: flat price line not found'; end if;
  d := replace(d, 'v_price := r.flat_price;',
    'if r.flat_price is null then raise exception ''That collection is coming soon and cannot be ordered yet.''; end if;
      v_price := r.flat_price;');
  execute d;
end $$;

insert into public.product_lines (vendor_id, code, name, description, sort_order, is_active)
values (2, 'S3A', 'Structure | 3 American Shaker', 'Framed shaker: 3" shaker door and 5-piece drawer fronts in HDF, framed full overlay (1/4" reveal), 1/2" plywood box, white melamine interior. Painted white, green or blue.', 1, true);

insert into public.price_codes (code, line_id, description)
select 'NAS', id, 'Structure | 3 American Shaker (MSRP)' from public.product_lines where code = 'S3A';

insert into public.door_styles (line_id, code, name, price_code, overlay, door_design, drawer_front, door_profile, drawer_profile,
                                tagline, customer_description, sort_order, is_active)
select (select id from public.product_lines where code = 'S3A'), 'S3A-LOVELAND', 'Loveland', 'NAS', 'Framed, full overlay (1/4" reveal)', '3" wide shaker, HDF', '5-piece',
        'shaker', 'shaker', 'Framed 3" shaker · Painted',
        'A classic 3" shaker door with 5-piece drawer fronts on a framed, full-overlay plywood cabinet. Painted white, green or blue.', 16, true;

insert into public.finishes (door_style_id, code, name, swatch_hex, sort_order, is_active)
select ds.id, x.code, x.name, x.hex, x.ord, true
from (values ('WP', 'White Paint', '#F2F0EB', 10), ('GP', 'Green Paint', '#7E8F7E', 20), ('BP', 'Blue Paint', '#3E5573', 30)) as x (code, name, hex, ord)
join public.door_styles ds on ds.code = 'S3A-LOVELAND';

insert into public.product_families (slug, name, description, room_type, kind, sort_order, is_active)
values ('s3a-base-drawer-2-door', 'American Shaker Base Cabinet', '1 drawer over 2 doors', 'Base', 'cabinet', 9000, false),
       ('s3a-wall-glass', 'American Shaker Glass Wall Cabinet', '2 glass doors', 'Wall', 'cabinet', 9001, false),
       ('s3a-crown', 'American Shaker Large Crown Molding', null, null, 'molding', 9002, false),
       ('s3a-light-rail', 'American Shaker Light Rail', null, null, 'molding', 9003, false);

insert into public.products (vendor_id, sku, mfg_sku, kind, room_type, family, family_id, subtype, description,
                             width, height, depth, doors, drawers, pullout_shelves, hinge, has_drawer, finish_applies,
                             review_note, sort_order, is_active)
values
 (2, 'AS-B30', 'B30', 'cabinet', 'Base', 'American Shaker Base Cabinet', (select id from public.product_families where slug = 's3a-base-drawer-2-door'), 'Standard', '1 drawer over 2 doors',
  30, 34.5, 24, 2, 1, 0, 'N/A', true, true, 'Price list says "double door base"; drawer over doors per the rendering, confirm', 9000, false),
 (2, 'AS-W3036GD', 'W3036GD', 'cabinet', 'Wall', 'American Shaker Glass Wall Cabinet', (select id from public.product_families where slug = 's3a-wall-glass'), 'Glass', '2 glass doors, 36" high',
  30, 36, 12, 2, 0, 0, 'N/A', false, true, null, 9001, false),
 (2, 'AS-ACM8', 'ACM8', 'molding', null, 'American Shaker Large Crown Molding', (select id from public.product_families where slug = 's3a-crown'), null, 'Large crown molding, 3-1/4" x 96"',
  null, null, null, 0, 0, 0, null, false, true, null, 9002, false),
 (2, 'AS-LRM8', 'LRM8', 'molding', null, 'American Shaker Light Rail', (select id from public.product_families where slug = 's3a-light-rail'), null, 'Light rail molding, 2" x 96"',
  null, null, null, 0, 0, 0, null, false, true, null, 9003, false);

insert into public.curated_collections (slug, name, tagline, description, space, hero_image_url, is_published, sort_order, card)
values ('american-hutch', 'The American Hutch', 'A framed shaker hutch and buffet with glass-door uppers.',
  'A 60" hutch: two shaker base cabinets with a drawer over two doors, a countertop, and two glass-door wall cabinets with crown molding and an under-cabinet light rail. Framed, full-overlay plywood construction. Countertop and backsplash through Design Lab.',
  'Dining', '/Assets/Images/curated/american-hutch-front.webp', true, 4,
  '{"no": "008", "subtitle": "Hutch & Buffet", "title": "THE AMERICAN HUTCH", "caption": "Structure|3 Curated Collection 008", "tag": "Designed in the Lab", "maker": "STRUCTURE|3 Cabinetry & Closets", "drawing_title": "Front Elevation", "finish": "Green Paint", "sheet": {"sheet": "A1", "scale": "NTS", "date": "11/10/2026", "rev": "A"}, "specs": [["Construction", "Framed full overlay (1/4\" reveal), 1/2\" plywood"], ["Interior", "White melamine"], ["Door style", "Loveland (3\" wide shaker, HDF)"], ["Drawer front", "5-piece"], ["Upper doors", "Glass (W3036GD)"], ["Finish", "Green paint"], ["Drawer box", "To be confirmed"]], "notes": ["Overall width = 60\" (approx.).", "Base cabinets: two 30\" wide, each with 1 drawer over 2 doors.", "Base height = 34.5\"; countertop 1.5\" (36\" to top).", "Wall cabinets: two 30\" wide x 36\" high, glass doors.", "Wall cabinets mount 18\" above the countertop.", "Crown molding on top (approx. 93\" overall).", "Under-cabinet light rail.", "Countertop and backsplash: see Design Lab.", "See Design Lab for alternative sizes, colors, and door style options."], "mods": {}, "blueprint": [{"id": "left-base", "kind": "base", "name": "Left base", "x": 0, "y": 0, "w": 30, "h": 34.5, "d": 24, "doors": 2, "drawers": 1, "shelves": 0, "toe": 4.5, "crown": 0}, {"id": "right-base", "kind": "base", "name": "Right base", "x": 30, "y": 0, "w": 30, "h": 34.5, "d": 24, "doors": 2, "drawers": 1, "shelves": 0, "toe": 4.5, "crown": 0}, {"id": "countertop", "kind": "counter", "name": "Countertop", "x": 0, "y": 34.5, "w": 60, "h": 1.5, "d": 24, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "left-glass-wall-cabinet", "kind": "wall", "name": "Left glass wall cabinet", "x": 0, "y": 54, "w": 30, "h": 36, "d": 12, "doors": 2, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "right-glass-wall-cabinet", "kind": "wall", "name": "Right glass wall cabinet", "x": 30, "y": 54, "w": 30, "h": 36, "d": 12, "doors": 2, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}, {"id": "crown-molding", "kind": "filler", "name": "Crown molding", "x": -1, "y": 90, "w": 62, "h": 3, "d": 24, "doors": 0, "drawers": 0, "shelves": 0, "toe": 0, "crown": 0}]}'::jsonb);

insert into public.curated_collection_items (collection_id, product_id, quantity, sort_order)
select c.id, p.id, x.qty, x.ord
from (values ('AS-B30', 2, 10), ('AS-W3036GD', 2, 20), ('AS-ACM8', 1, 30), ('AS-LRM8', 1, 40)) as x (sku, qty, ord)
join public.curated_collections c on c.slug = 'american-hutch'
join public.products p on p.sku = x.sku and p.vendor_id = 2;


-- Offered in Loveland. No price in this public file: flat_price stays NULL (= coming soon)
-- until the private seed (Design Labs/database/seed/0002_nextar_american.sql) loads the
-- price list and sets it.
insert into public.curated_collection_styles (collection_id, door_style_id, flat_price)
select c.id, ds.id, null from public.curated_collections c join public.door_styles ds on ds.code = 'S3A-LOVELAND'
where c.slug = 'american-hutch';

do $$
begin
  if (select count(*) from public.curated_collection_items ci join public.curated_collections c on c.id = ci.collection_id
       where c.slug = 'american-hutch') <> 4 then
    raise exception 'American Hutch: expected 4 item rows';
  end if;
  if not exists (select 1 from public.storefront_collections where slug = 'american-hutch') then
    raise exception 'American Hutch: not visible in storefront_collections';
  end if;
end $$;
