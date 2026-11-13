-- 0023: no prices for the public (CEO, 2026-10-04: "zero pricing displayed").
--
-- The storefront views keep every row, so the shop still knows which cabinet
-- comes in which door style, but the price columns are NULL unless the caller
-- is a signed-in employee/admin. Hiding prices only in the page would leave them
-- one API call away.
--
-- The check reads public.profiles directly (the views run as their owner) rather
-- than calling private.is_employee(), which anon is not allowed to execute.
-- place_order() still prices every line on the server, so orders are unaffected.

create or replace view public.storefront_offers as
 select pp.product_id,
    ds.id as door_style_id,
    null::smallint as upgrade_id,
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) end as retail_price
   from product_prices pp
     join products p on p.id = pp.product_id and p.is_active
     join door_styles ds on ds.price_code = pp.price_code and ds.is_active
     left join private.line_pricing lp on lp.line_id = ds.line_id
union all
 select pp.product_id,
    u.door_style_id,
    u.id as upgrade_id,
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) end as retail_price
   from product_prices pp
     join products p on p.id = pp.product_id and p.is_active
     join upgrades u on u.price_code = pp.price_code and u.is_active
     join door_styles ds on ds.id = u.door_style_id and ds.is_active
     left join private.line_pricing lp on lp.line_id = ds.line_id;

create or replace view public.storefront_product_modifications as
 select pm.product_id,
    m.id as modification_id,
    m.sku,
    m.name,
    m.applies_to,
    m.notes,
    m.line_id,
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) end as retail_price
   from product_modifications pm
     join modifications m on m.id = pm.modification_id and m.is_active
     left join private.line_pricing lp on lp.line_id = m.line_id;

create or replace view public.storefront_modifications as
 select m.id,
    m.sku,
    m.name,
    m.applies_to,
    m.notes,
    pl.id as line_id,
    pl.name as line_name,
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) end as retail_price
   from modifications m
     join product_lines pl on pl.id = m.line_id
     left join private.line_pricing lp on lp.line_id = pl.id
  where m.is_active;

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
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then s.flat_price end::numeric(12, 2) as flat_price,
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then (select sum(ci.quantity::numeric * round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2))
                 from curated_collection_items ci
                 join product_prices pp on pp.product_id = ci.product_id and pp.price_code = ds.price_code
                 left join private.line_pricing lp on lp.line_id = ds.line_id
                where ci.collection_id = c.id) end as individual_price,
    (select count(*)
       from curated_collection_items ci
      where ci.collection_id = c.id and not (exists (select 1 from product_prices pp
              where pp.product_id = ci.product_id and pp.price_code = ds.price_code))) as items_not_offered
   from curated_collections c
     join curated_collection_styles s on s.collection_id = c.id
     join door_styles ds on ds.id = s.door_style_id and ds.is_active
  where c.is_published;

create or replace view public.storefront_variants as
 select v.product_id, v.sku, v.mfg_sku, v.kind, v.room_type, v.space, v.family_id, v.family_slug, v.family_name,
    v.family_image_url, v.subtype, v.description, v.width, v.height, v.depth, v.doors, v.drawers, v.shelves,
    v.pullout_shelves, v.hinge, v.notes, v.sort_order, v.line_id, v.line_name, v.door_style_id, v.door_style,
    v.door_style_code, v.finish_id, v.finish_code, v.finish_name, v.swatch_hex, v.upgrade_id, v.upgrade_code,
    v.upgrade_name,
    case when (select exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role in ('employee', 'admin')))
         then v.retail_price end as retail_price,
    v.variant_key
   from private.variants_base v;

-- The collection flat price also sits in a plain table that anon can read.
revoke select on public.curated_collection_styles from anon;
grant select (collection_id, door_style_id) on public.curated_collection_styles to anon;

-- place_order() still prices every line, but only tells employees the total.
-- (Same as 0022 except the last line.)
create or replace function public.place_order(p_items jsonb, p_contact jsonb, p_notes text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_order_id   uuid;
  v_order_no   bigint;
  v_subtotal   numeric(12, 2) := 0;
  v_item       jsonb;
  v_qty        integer;
  v_price      numeric(12, 2);
  v_mods_price numeric(12, 2);
  v_mods       jsonb;
  v_name       text := nullif(trim(p_contact ->> 'name'), '');
  v_email      text := nullif(trim(p_contact ->> 'email'), '');
  r            record;
  f            record;
begin
  if v_name is null or v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A name and a valid email are required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Too many cart lines.';
  end if;
  -- One look per order: every line in the same finish (so the same maker).
  if (select count(distinct e ->> 'finish_id') from jsonb_array_elements(p_items) e) > 1 then
    raise exception 'An order can only be in one finish. Change the rest of your cart to match, then try again.';
  end if;

  insert into public.orders (profile_id, contact_name, contact_email, contact_phone, shipping_address, customer_notes, subtotal)
  values ((select auth.uid()), v_name, v_email, nullif(trim(p_contact ->> 'phone'), ''), p_contact -> 'address',
          nullif(trim(p_notes), ''), 0)
  returning id, order_number into v_order_id, v_order_no;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 or v_qty > 999 then raise exception 'Invalid quantity.'; end if;

    select fi.id, fi.code, fi.name, ds.id as door_style_id, ds.name as door_style, ds.price_code, ds.line_id,
           coalesce((select vm.maker_name from private.vendor_makers vm where vm.vendor_id = v.id), v.name) as vendor_name
      into f
      from public.finishes fi
      join public.door_styles ds on ds.id = fi.door_style_id
      join public.product_lines pl on pl.id = ds.line_id
      join public.vendors v on v.id = pl.vendor_id
     where fi.id = (v_item ->> 'finish_id')::smallint and fi.is_active and ds.is_active;

    if v_item ->> 'type' = 'product' then
      select p.id, p.sku, p.mfg_sku, pf.name as family_name, p.description, p.hinge, p.finish_applies,
             u.id as upgrade_id, u.name as upgrade_name,
             round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) as price
        into r
        from public.products p
        join public.product_families pf on pf.id = p.family_id
        left join public.upgrades u on u.id = (v_item ->> 'upgrade_id')::smallint and u.is_active
        join public.product_prices pp on pp.product_id = p.id
             and pp.price_code = coalesce(u.price_code, f.price_code)
        left join private.line_pricing lp on lp.line_id = f.line_id
       where p.id = (v_item ->> 'product_id')::integer and p.is_active
         and f.id is not null
         and (u.id is null or u.door_style_id = f.door_style_id);
      if r.id is null then raise exception 'An item in the cart is no longer available in that finish.'; end if;
      if r.price is null then raise exception 'Pricing is not configured.'; end if;
      if (v_item ->> 'upgrade_id') is not null and r.upgrade_id is null then
        raise exception 'That upgrade is not available.';
      end if;

      select coalesce(sum(round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2)), 0),
             coalesce(jsonb_agg(jsonb_build_object('sku', m.sku, 'name', m.name,
                      'price', round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2))), '[]')
        into v_mods_price, v_mods
        from public.modifications m
        join public.product_modifications pm on pm.modification_id = m.id and pm.product_id = r.id
        left join private.line_pricing lp on lp.line_id = m.line_id
       where m.is_active
         and m.id in (select (jsonb_array_elements_text(coalesce(v_item -> 'modification_ids', '[]'))) ::smallint);
      if jsonb_array_length(v_mods) <> (select count(distinct x) from jsonb_array_elements_text(coalesce(v_item -> 'modification_ids', '[]')) x) then
        raise exception 'A selected modification is not available for that item.';
      end if;

      v_price := r.price + v_mods_price;
      insert into public.order_items (order_id, item_type, product_id, door_style_id, finish_id, upgrade_id, hinge_side,
                                      name_snapshot, sku_snapshot, mfg_sku_snapshot, finish_snapshot, mods_snapshot,
                                      vendor_snapshot, unit_price, quantity)
      values (v_order_id, 'product', r.id, f.door_style_id, f.id, r.upgrade_id,
              case when r.hinge in ('L/R required') then nullif(upper(v_item ->> 'hinge_side'), '') end,
              r.family_name || ' — ' || r.description || coalesce(' + ' || r.upgrade_name, ''),
              r.sku, r.mfg_sku, f.door_style || ' / ' || f.code || ' ' || f.name, v_mods, f.vendor_name, v_price, v_qty);

    elsif v_item ->> 'type' = 'collection' then
      select c.id, c.name, s.flat_price into r
        from public.curated_collections c
        join public.curated_collection_styles s on s.collection_id = c.id and s.door_style_id = f.door_style_id
       where c.id = (v_item ->> 'collection_id')::integer and c.is_published and f.id is not null;
      if r.id is null then raise exception 'A collection in the cart is no longer available in that finish.'; end if;

      v_price := r.flat_price;
      insert into public.order_items (order_id, item_type, collection_id, door_style_id, finish_id,
                                      name_snapshot, finish_snapshot, mods_snapshot, vendor_snapshot, unit_price, quantity)
      values (v_order_id, 'collection', r.id, f.door_style_id, f.id,
              r.name || ' (Curated Collection)', f.door_style || ' / ' || f.code || ' ' || f.name,
              (select coalesce(jsonb_agg(jsonb_build_object('sku', p.sku, 'mfg_sku', p.mfg_sku, 'quantity', ci.quantity)
                                         order by ci.sort_order), '[]')
                 from public.curated_collection_items ci join public.products p on p.id = ci.product_id
                where ci.collection_id = r.id),
              f.vendor_name, v_price, v_qty);
    else
      raise exception 'Unknown cart line type.';
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
    'subtotal', case when (select private.is_employee()) then v_subtotal end);
end;
$function$;
