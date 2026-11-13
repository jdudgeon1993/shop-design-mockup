-- 0022: schema room for Structure | 3 (Design Lab's private label).
--
-- * private.vendor_makers: who really makes a line. Public vendor rows carry
--   the brand customers see; the maker is readable only by the server (and
--   employees through order snapshots). Data is seeded privately, not here.
-- * price_codes: up to 4 characters (CNC uses single letters).
-- * door_styles.price_code no longer unique: two styles can share a price
--   tier (two collections, same material).
-- * door_profile 'slab' for flat doors; product kind 'closet'.
-- * place_order(): order lines record the maker from private.vendor_makers.

create table if not exists private.vendor_makers (
  vendor_id  smallint primary key references public.vendors(id) on delete cascade,
  maker_name text not null,
  address    text,
  phone      text,
  email      text,
  website    text,
  notes      text
);
revoke all on private.vendor_makers from public, anon, authenticated;

alter table public.price_codes drop constraint if exists price_codes_code_check;
alter table public.price_codes add constraint price_codes_code_check check (code ~ '^[A-Z0-9]{1,4}$');

alter table public.door_styles drop constraint if exists door_styles_price_code_key;
alter table public.door_styles drop constraint if exists door_styles_door_profile_check;
alter table public.door_styles add constraint door_styles_door_profile_check check (door_profile = any (array['shaker', 'raised', 'slab']));

alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check
  check (kind = any (array['cabinet', 'filler', 'panel', 'molding', 'decorative', 'accessory', 'hood', 'finish_supply', 'closet']));

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
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'subtotal', v_subtotal);
end;
$function$;
