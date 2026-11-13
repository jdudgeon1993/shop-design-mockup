-- 0024: tags. A tag is a named label that can be put on things. Some tags unlock
-- parts of the site; the rest are plain labels until something uses them.
--
-- Today tags go on team members (profile_tags). Products and other things can get
-- their own <thing>_tags table later; tags.applies_to says what a tag may go on.
--
-- Built-in tags (is_system) are the ones the code checks, so they can't be deleted
-- or renamed by slug:
--   admin    adds team members, changes their tags, manages tags
--   pricing  the database returns prices (storefront views)
--   makers   sees the real manufacturer on orders (enforced in 0025)
--
-- Being on the team is still profiles.role = 'employee' (the dashboard, RLS and the
-- video token server check that). Admin is a tag, not a role, so it doesn't break
-- the token server's role = 'employee' check.

create table public.tags (
  slug        text primary key check (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  label       text not null check (length(trim(label)) between 1 and 40),
  description text check (length(description) <= 300),
  color       text not null default '' check (color in ('', 'ok', 'info', 'gold', 'warn', 'bad')),
  applies_to  text[] not null default '{member}' check (applies_to <@ array['member', 'product']::text[] and cardinality(applies_to) > 0),
  is_system   boolean not null default false,
  sort_order  smallint not null default 100,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index tags_created_by_idx on public.tags (created_by);

create table public.profile_tags (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tag        text not null references public.tags(slug) on update cascade on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  added_at   timestamptz not null default now(),
  primary key (profile_id, tag)
);
create index profile_tags_tag_idx on public.profile_tags (tag);
create index profile_tags_added_by_idx on public.profile_tags (added_by);

insert into public.tags (slug, label, description, color, is_system, sort_order) values
  ('admin',   'Admin',           'Adds team members, changes their tags and manages tags.', 'bad',  true, 10),
  ('pricing', 'See pricing',     'Prices in the DIY Shop, Collections and cart.',            'ok',   true, 20),
  ('makers',  'See real makers', 'The real manufacturer (Nextar, CNC) on orders, for ordering from them.', 'gold', true, 30);

-- Everyone on the team today keeps what they had: all three.
insert into public.profile_tags (profile_id, tag, added_by)
select p.id, t.slug, null from public.profiles p cross join public.tags t
 where p.role in ('employee', 'admin');

-- ---------- helpers ----------
create or replace function private.has_tag(p_tag text)
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from public.profile_tags where profile_id = (select auth.uid()) and tag = p_tag);
$$;
revoke all on function private.has_tag(text) from public, anon;
grant execute on function private.has_tag(text) to authenticated;

-- ---------- guards ----------
-- Built-in tags keep their slug and can't be deleted; there is always one admin left.
create or replace function private.tags_guard()
 returns trigger language plpgsql set search_path to ''
as $$
begin
  if tg_op = 'DELETE' and old.is_system then raise exception 'Built-in tags can''t be deleted.'; end if;
  if tg_op = 'UPDATE' and old.is_system and (new.slug <> old.slug or not new.is_system) then
    raise exception 'Built-in tags keep their name.';
  end if;
  if tg_op = 'UPDATE' and not old.is_system and new.is_system then raise exception 'Only migrations add built-in tags.'; end if;
  return coalesce(new, old);
end;
$$;
create trigger tags_guard before update or delete on public.tags for each row execute function private.tags_guard();

create or replace function private.last_admin_guard()
 returns trigger language plpgsql set search_path to ''
as $$
begin
  if old.tag = 'admin' and not exists (select 1 from public.profile_tags where tag = 'admin' and profile_id <> old.profile_id) then
    raise exception 'There has to be at least one admin.';
  end if;
  return old;
end;
$$;
create trigger profile_tags_last_admin before delete on public.profile_tags for each row execute function private.last_admin_guard();

-- Member tags only go on team members, and only tags meant for members.
create or replace function private.profile_tags_check()
 returns trigger language plpgsql set search_path to ''
as $$
begin
  if not exists (select 1 from public.tags where slug = new.tag and 'member' = any(applies_to)) then
    raise exception 'That tag isn''t for team members.';
  end if;
  if not exists (select 1 from public.profiles where id = new.profile_id and role in ('employee', 'admin')) then
    raise exception 'Tags go on team members only.';
  end if;
  return new;
end;
$$;
create trigger profile_tags_check before insert on public.profile_tags for each row execute function private.profile_tags_check();

-- ---------- access ----------
alter table public.tags enable row level security;
alter table public.profile_tags enable row level security;

create policy "tags: team reads" on public.tags for select to authenticated using ((select private.is_employee()));
create policy "tags: admins add" on public.tags for insert to authenticated with check ((select private.has_tag('admin')) and not is_system);
create policy "tags: admins edit" on public.tags for update to authenticated using ((select private.has_tag('admin'))) with check ((select private.has_tag('admin')));
create policy "tags: admins delete" on public.tags for delete to authenticated using ((select private.has_tag('admin')));
revoke all on public.tags from anon;
revoke insert, update on public.tags from authenticated;
grant insert (slug, label, description, color, applies_to, sort_order) on public.tags to authenticated;
grant update (label, description, color, applies_to, sort_order) on public.tags to authenticated;

create policy "profile_tags: read own or team" on public.profile_tags for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_employee()));
create policy "profile_tags: admins add" on public.profile_tags for insert to authenticated with check ((select private.has_tag('admin')));
create policy "profile_tags: admins remove" on public.profile_tags for delete to authenticated using ((select private.has_tag('admin')));
revoke all on public.profile_tags from anon;
revoke update on public.profile_tags from authenticated;

-- Admins can fix a team member's name and phone (column grants already limit
-- profiles updates to full_name, phone and company).
create policy "profiles: admins update team" on public.profiles for update to authenticated
  using ((select private.has_tag('admin')) and role in ('employee', 'admin'))
  with check ((select private.has_tag('admin')));

-- Taking someone off the team: no tags, back to a plain customer account.
create or replace function public.team_remove_member(p_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $$
begin
  if not (select private.has_tag('admin')) then raise exception 'Only admins can remove team members.'; end if;
  if p_id = (select auth.uid()) then raise exception 'You can''t remove yourself.'; end if;
  delete from public.profile_tags where profile_id = p_id;
  update public.profiles set role = 'customer' where id = p_id and role in ('employee', 'admin');
end;
$$;
revoke all on function public.team_remove_member(uuid) from public, anon;
grant execute on function public.team_remove_member(uuid) to authenticated;

-- For the team-member edge function only (service role): find an existing account.
create or replace function public.team_user_id_by_email(p_email text)
 returns uuid language sql stable security definer set search_path to ''
as $$ select id from auth.users where lower(email) = lower(trim(p_email)) limit 1; $$;
revoke all on function public.team_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.team_user_id_by_email(text) to service_role;

-- ---------- prices follow the pricing tag ----------
-- Same views as 0023, with the role check swapped for the tag.
create or replace view public.storefront_offers as
 select pp.product_id,
    ds.id as door_style_id,
    null::smallint as upgrade_id,
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
         then round(pp.list_price * lp.dealer_multiplier * lp.retail_multiplier, 2) end as retail_price
   from product_prices pp
     join products p on p.id = pp.product_id and p.is_active
     join door_styles ds on ds.price_code = pp.price_code and ds.is_active
     left join private.line_pricing lp on lp.line_id = ds.line_id
union all
 select pp.product_id,
    u.door_style_id,
    u.id as upgrade_id,
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
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
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
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
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
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
    case when (select exists (select 1 from public.profile_tags pt where pt.profile_id = (select auth.uid()) and pt.tag = 'pricing'))
         then v.retail_price end as retail_price,
    v.variant_key
   from private.variants_base v;

-- place_order(): same as 0023, but the total comes back only with See pricing.
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
    'subtotal', case when (select private.has_tag('pricing')) then v_subtotal end);
end;
$function$;
