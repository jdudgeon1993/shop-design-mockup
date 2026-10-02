-- 0008_store.sql
-- Curated collections, orders and order submission. Replaces the early experimental
-- cart_items / orders / order_items / curated_collections tables (all empty on 2026-10-01).
--
-- The cart lives in the browser (localStorage) until the customer submits; there is no
-- payment step. public.place_order() re-prices every line on the server, so a browser
-- can never set its own price. Payment and invoicing happen in QuickBooks afterwards.

drop table if exists public.order_items, public.orders, public.cart_items, public.curated_collections cascade;

-- ---------- curated collections ----------
create table public.curated_collections (
  id              integer generated always as identity primary key,
  slug            text not null unique,
  name            text not null,
  tagline         text,
  description     text,
  space           text check (space in ('Kitchen', 'Bath')),
  hero_image_url  text,
  gallery_urls    text[] not null default '{}',
  is_published    boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger curated_collections_updated_at before update on public.curated_collections
  for each row execute function private.set_updated_at();

create table public.curated_collection_items (
  collection_id  integer not null references public.curated_collections (id) on delete cascade,
  product_id     integer not null references public.products (id),
  quantity       integer not null default 1 check (quantity > 0),
  sort_order     integer not null default 0,
  primary key (collection_id, product_id)
);
create index curated_collection_items_product_idx on public.curated_collection_items (product_id);

-- The flat price customers pay for a collection, per door style (finish chosen by the customer).
create table public.curated_collection_styles (
  collection_id  integer not null references public.curated_collections (id) on delete cascade,
  door_style_id  smallint not null references public.door_styles (id),
  flat_price     numeric(12, 2) not null check (flat_price > 0),
  primary key (collection_id, door_style_id)
);
create index curated_collection_styles_style_idx on public.curated_collection_styles (door_style_id);

-- ---------- orders ----------
create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           bigint generated always as identity (start with 1001) unique,
  profile_id             uuid references public.profiles (id) on delete set null,   -- null = guest
  status                 text not null default 'submitted'
                         check (status in ('submitted', 'reviewing', 'invoiced', 'paid', 'ordered_from_vendor',
                                           'in_production', 'shipped', 'completed', 'cancelled')),
  contact_name           text not null,
  contact_email          text not null,
  contact_phone          text,
  shipping_address       jsonb,
  customer_notes         text,
  subtotal               numeric(12, 2) not null,
  quickbooks_invoice_id  text,                       -- filled in once invoiced in QuickBooks
  internal_notes         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index orders_profile_idx on public.orders (profile_id);
create index orders_status_idx on public.orders (status);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  item_type         text not null check (item_type in ('product', 'collection')),
  product_id        integer references public.products (id) on delete set null,
  collection_id     integer references public.curated_collections (id) on delete set null,
  door_style_id     smallint references public.door_styles (id) on delete set null,
  finish_id         smallint references public.finishes (id) on delete set null,
  upgrade_id        smallint references public.upgrades (id) on delete set null,
  hinge_side        text check (hinge_side in ('L', 'R')),
  -- Snapshots: what the customer saw and what to order from the vendor, frozen at submit time.
  name_snapshot     text not null,
  sku_snapshot      text,
  mfg_sku_snapshot  text,
  finish_snapshot   text,
  mods_snapshot     jsonb not null default '[]',
  unit_price        numeric(12, 2) not null,
  quantity          integer not null check (quantity > 0),
  line_total        numeric(12, 2) generated always as (unit_price * quantity) stored,
  created_at        timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index order_items_collection_idx on public.order_items (collection_id);
create index order_items_door_style_idx on public.order_items (door_style_id);
create index order_items_finish_idx on public.order_items (finish_id);
create index order_items_upgrade_idx on public.order_items (upgrade_id);

-- ---------- RLS ----------
alter table public.curated_collections enable row level security;
alter table public.curated_collection_items enable row level security;
alter table public.curated_collection_styles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "curated_collections: public reads published" on public.curated_collections
  for select to anon, authenticated using (is_published or (select private.is_employee()));
create policy "curated_collection_items: public reads published" on public.curated_collection_items
  for select to anon, authenticated using (exists (
    select 1 from public.curated_collections c where c.id = collection_id and (c.is_published or (select private.is_employee()))));
create policy "curated_collection_styles: public reads published" on public.curated_collection_styles
  for select to anon, authenticated using (exists (
    select 1 from public.curated_collections c where c.id = collection_id and (c.is_published or (select private.is_employee()))));

do $$
declare t text;
begin
  foreach t in array array['curated_collections', 'curated_collection_items', 'curated_collection_styles']
  loop
    execute format('create policy "%s: employees insert" on public.%I for insert to authenticated with check ((select private.is_employee()))', t, t);
    execute format('create policy "%s: employees update" on public.%I for update to authenticated using ((select private.is_employee())) with check ((select private.is_employee()))', t, t);
    execute format('create policy "%s: employees delete" on public.%I for delete to authenticated using ((select private.is_employee()))', t, t);
  end loop;
end $$;

-- Orders are only created by place_order(). Customers read their own; employees manage all.
revoke all on public.orders, public.order_items from anon;
create policy "orders: read own or employee" on public.orders for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_employee()));
create policy "orders: employees update" on public.orders for update to authenticated
  using ((select private.is_employee())) with check ((select private.is_employee()));
create policy "orders: employees delete" on public.orders for delete to authenticated
  using ((select private.is_employee()));
create policy "order_items: read own or employee" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.profile_id = (select auth.uid()) or (select private.is_employee()))));
create policy "order_items: employees delete" on public.order_items for delete to authenticated
  using ((select private.is_employee()));

-- ---------- collection pricing view (public) ----------
-- Flat price per door style, plus what the same cabinets would cost bought individually
-- in the cheapest finish of that style (for "you save $X").
create view public.storefront_collections as
select c.id as collection_id, c.slug, c.name, c.tagline, c.description, c.space, c.hero_image_url, c.gallery_urls,
       c.sort_order, s.door_style_id, ds.name as door_style, ds.code as door_style_code, s.flat_price,
       (select sum(ci.quantity * round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2))
          from public.curated_collection_items ci
          join public.product_prices pp on pp.product_id = ci.product_id and pp.price_code = ds.price_code
          left join private.line_pricing lp on lp.line_id = ds.line_id
         where ci.collection_id = c.id) as individual_price,
       (select count(*) from public.curated_collection_items ci
          where ci.collection_id = c.id
            and not exists (select 1 from public.product_prices pp
                            where pp.product_id = ci.product_id and pp.price_code = ds.price_code)) as items_not_offered
from public.curated_collections c
join public.curated_collection_styles s on s.collection_id = c.id
join public.door_styles ds on ds.id = s.door_style_id and ds.is_active
where c.is_published;
comment on view public.storefront_collections is 'Published collections with flat price per door style and the individual-items price for comparison. items_not_offered should be 0.';
revoke all on public.storefront_collections from anon, authenticated;
grant select on public.storefront_collections to anon, authenticated;

-- ---------- place_order ----------
-- p_items: [{"type":"product","product_id":1,"finish_id":3,"upgrade_id":null,"hinge_side":"L",
--            "quantity":2,"modification_ids":[5]},
--           {"type":"collection","collection_id":1,"finish_id":3,"quantity":1}]
-- p_contact: {"name":"...","email":"...","phone":"...","address":{...}}  (name/email required)
create or replace function public.place_order(p_items jsonb, p_contact jsonb, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.orders (profile_id, contact_name, contact_email, contact_phone, shipping_address, customer_notes, subtotal)
  values ((select auth.uid()), v_name, v_email, nullif(trim(p_contact ->> 'phone'), ''), p_contact -> 'address',
          nullif(trim(p_notes), ''), 0)
  returning id, order_number into v_order_id, v_order_no;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_qty < 1 or v_qty > 999 then raise exception 'Invalid quantity.'; end if;

    -- The finish decides the door style (and so the price code) for every line type.
    select fi.id, fi.code, fi.name, ds.id as door_style_id, ds.name as door_style, ds.price_code, ds.line_id
      into f
      from public.finishes fi join public.door_styles ds on ds.id = fi.door_style_id
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

      -- Mods: only those linked to this product.
      select coalesce(sum(round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2)), 0),
             coalesce(jsonb_agg(jsonb_build_object('sku', m.sku, 'name', m.name,
                      'price', round(m.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2))), '[]')
        into v_mods_price, v_mods
        from public.modifications m
        join public.product_modifications pm on pm.modification_id = m.id and pm.product_id = r.id
        left join private.line_pricing lp on lp.line_id = m.line_id
       where m.is_active
         and m.id in (select (jsonb_array_elements_text(coalesce(v_item -> 'modification_ids', '[]'))) ::smallint);
      -- Every requested mod (duplicates ignored) must be one this product can take.
      if jsonb_array_length(v_mods) <> (select count(distinct x) from jsonb_array_elements_text(coalesce(v_item -> 'modification_ids', '[]')) x) then
        raise exception 'A selected modification is not available for that item.';
      end if;

      v_price := r.price + v_mods_price;
      insert into public.order_items (order_id, item_type, product_id, door_style_id, finish_id, upgrade_id, hinge_side,
                                      name_snapshot, sku_snapshot, mfg_sku_snapshot, finish_snapshot, mods_snapshot,
                                      unit_price, quantity)
      values (v_order_id, 'product', r.id, f.door_style_id, f.id, r.upgrade_id,
              case when r.hinge in ('L/R required') then nullif(upper(v_item ->> 'hinge_side'), '') end,
              r.family_name || ' — ' || r.description || coalesce(' + ' || r.upgrade_name, ''),
              r.sku, r.mfg_sku, f.door_style || ' / ' || f.code || ' ' || f.name, v_mods, v_price, v_qty);

    elsif v_item ->> 'type' = 'collection' then
      select c.id, c.name, s.flat_price into r
        from public.curated_collections c
        join public.curated_collection_styles s on s.collection_id = c.id and s.door_style_id = f.door_style_id
       where c.id = (v_item ->> 'collection_id')::integer and c.is_published and f.id is not null;
      if r.id is null then raise exception 'A collection in the cart is no longer available in that finish.'; end if;

      v_price := r.flat_price;
      insert into public.order_items (order_id, item_type, collection_id, door_style_id, finish_id,
                                      name_snapshot, finish_snapshot, mods_snapshot, unit_price, quantity)
      values (v_order_id, 'collection', r.id, f.door_style_id, f.id,
              r.name || ' (Curated Collection)', f.door_style || ' / ' || f.code || ' ' || f.name,
              (select coalesce(jsonb_agg(jsonb_build_object('sku', p.sku, 'mfg_sku', p.mfg_sku, 'quantity', ci.quantity)
                                         order by ci.sort_order), '[]')
                 from public.curated_collection_items ci join public.products p on p.id = ci.product_id
                where ci.collection_id = r.id),
              v_price, v_qty);
    else
      raise exception 'Unknown cart line type.';
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'subtotal', v_subtotal);
end;
$$;
comment on function public.place_order(jsonb, jsonb, text) is
  'Submit a cart. Re-prices everything server-side; guests allowed (contact name/email required). No payment: invoicing happens in QuickBooks.';
revoke all on function public.place_order(jsonb, jsonb, text) from public;
grant execute on function public.place_order(jsonb, jsonb, text) to anon, authenticated;
