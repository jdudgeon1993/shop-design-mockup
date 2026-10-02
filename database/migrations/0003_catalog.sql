-- 0003_catalog.sql
-- Vendor catalog: lines, door styles, finishes, upgrades, products, list prices, modifications.
-- Each Google Sheets tab maps 1:1 to one of these tables.
--
-- Prices here are the manufacturer's LIST prices. They are readable by employees only.
-- The public site reads retail prices through the storefront views (0004).

-- ---------- price books (one per spec book import) ----------
create table public.vendors (
  id          smallint generated always as identity primary key,
  code        text not null unique,              -- 'CNC'
  name        text not null,                     -- 'CNC Cabinetry'
  created_at  timestamptz not null default now()
);

create table public.price_books (
  id              integer generated always as identity primary key,
  vendor_id       smallint not null references public.vendors (id),
  version         text not null,                 -- 'V01.08'
  effective_date  date,
  imported_at     timestamptz not null default now(),
  notes           text,
  unique (vendor_id, version)
);
comment on table public.price_books is 'Which spec book a price came from, so the next book can be diffed against this one.';

-- ---------- lines, price codes, door styles, finishes, upgrades ----------
create table public.product_lines (
  id          smallint generated always as identity primary key,
  vendor_id   smallint not null references public.vendors (id),
  code        text not null unique,              -- 'LX', 'BD'
  name        text not null,                     -- 'Luxor', 'Bedford'
  description text,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true
);

create table public.price_codes (
  code        text primary key check (code ~ '^[A-Z]$'),   -- L, Z, T, R, S
  line_id     smallint not null references public.product_lines (id),
  description text not null
);
comment on table public.price_codes is 'CNC price columns. A door style or upgrade is priced at one code.';

create table public.door_styles (
  id            smallint generated always as identity primary key,
  line_id       smallint not null references public.product_lines (id),
  code          text not null unique,            -- your short code, e.g. 'L5P'
  name          text not null,                   -- 'Luxor', 'Glencove', 'Country Oak', 'Dover'
  price_code    text not null unique references public.price_codes (code),
  overlay       text,
  door_design   text,
  drawer_front  text,
  notes         text,
  sort_order    smallint not null default 0,
  is_active     boolean not null default true
);

create table public.finishes (
  id             smallint generated always as identity primary key,
  door_style_id  smallint not null references public.door_styles (id),
  code           text not null,                  -- CNC finish code: 'L02', 'G07', 'D10'
  name           text not null,                  -- 'Smoky Grey'
  swatch_url     text,
  sort_order     smallint not null default 0,
  is_active      boolean not null default true,
  unique (door_style_id, code)
);

create table public.upgrades (
  id             smallint generated always as identity primary key,
  door_style_id  smallint not null references public.door_styles (id),
  code           text not null unique,           -- '5P'
  name           text not null,                  -- '5-Piece Drawer Front'
  price_code     text not null unique references public.price_codes (code),   -- 'Z'
  notes          text,
  is_active      boolean not null default true
);
comment on table public.upgrades is 'An upgrade is priced as a whole-cabinet price code (e.g. Z). A product offers it when it has a price at that code.';

-- ---------- products (Box tab + Mods & Other non-mod rows) ----------
create table public.products (
  id               integer generated always as identity primary key,
  vendor_id        smallint not null references public.vendors (id),
  sku              text not null,                -- your Box SKU: W3012, W0930-1D, B09, F330
  mfg_sku          text not null,                -- exactly as CNC prints it: 3012, 930, B9
  mfg_sku_alt      text,                         -- Bedford item # when it differs
  kind             text not null check (kind in ('cabinet', 'filler', 'panel', 'molding', 'decorative',
                                                  'accessory', 'hood', 'finish_supply')),
  room_type        text check (room_type in ('Wall', 'Base', 'Tall', 'Vanity')),
  description      text not null,                -- Box 'Cabinet Type': '2D, 12H, No Shelf'
  family           text,                         -- groups sizes into one site product
  subtype          text,
  width            numeric(6, 2),
  height           numeric(6, 2),
  depth            numeric(6, 2),
  doors            smallint,
  drawers          smallint,
  shelves          smallint,
  pullout_shelves  smallint not null default 0,
  hinge            text check (hinge in ('L/R required', 'Reversible', 'Order L or R', 'N/A')),
  has_drawer       boolean not null default false,  -- drawer or drawer front: the Z upgrade can apply
  finish_applies   boolean not null default true,   -- false = sold unfinished/natural (POS, cutlery divider)
  notes            text,
  review_note      text,                         -- the yellow 'Check' column
  spec_pages       text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (vendor_id, sku)
);
create index products_room_family_idx on public.products (room_type, family);
create index products_mfg_sku_idx on public.products (mfg_sku);
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_prices (
  product_id     integer not null references public.products (id) on delete cascade,
  price_code     text not null references public.price_codes (code),
  list_price     numeric(10, 2) not null check (list_price >= 0),
  price_book_id  integer references public.price_books (id),
  updated_at     timestamptz not null default now(),
  primary key (product_id, price_code)
);
comment on table public.product_prices is 'One row per product per price code. No row = not offered (N/A in the spec book).';
create index product_prices_code_idx on public.product_prices (price_code);
create trigger product_prices_updated_at before update on public.product_prices
  for each row execute function private.set_updated_at();

-- ---------- modifications (CT-...) ----------
create table public.modifications (
  id             smallint generated always as identity primary key,
  line_id        smallint not null references public.product_lines (id),
  sku            text not null,                  -- 'CT-CUT-DEEP-B'
  name           text not null,
  applies_to     text,                           -- 'Base', 'Wall', 'B09', 'Any'
  list_price     numeric(10, 2) not null check (list_price >= 0),
  notes          text,
  price_book_id  integer references public.price_books (id),
  is_active      boolean not null default true,
  unique (line_id, sku)
);

-- ---------- private pricing (never exposed) ----------
create table private.line_pricing (
  line_id            smallint primary key references public.product_lines (id),
  dealer_multiplier  numeric(6, 4) check (dealer_multiplier > 0),   -- your CNC multiplier, e.g. 0.4200
  retail_multiplier  numeric(6, 4) check (retail_multiplier > 0),   -- markup on dealer cost, e.g. 1.8000
  updated_at         timestamptz not null default now()
);
comment on table private.line_pricing is 'dealer cost = list x dealer_multiplier; retail = dealer cost x retail_multiplier. Null = not set yet (site shows no price).';
revoke all on private.line_pricing from public, anon, authenticated;

create or replace function private.retail_price(p_list numeric, p_line_id smallint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(p_list * lp.dealer_multiplier * lp.retail_multiplier, 2)
  from private.line_pricing lp
  where lp.line_id = p_line_id;
$$;
revoke all on function private.retail_price(numeric, smallint) from public, anon, authenticated;

-- ---------- row level security ----------
-- Catalog descriptions: anyone may read active rows; employees manage.
do $$
declare t text;
begin
  foreach t in array array['vendors', 'product_lines', 'price_codes', 'door_styles', 'finishes', 'upgrades', 'products']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: public read" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('create policy "%s: employees insert" on public.%I for insert to authenticated
                    with check ((select private.is_employee()))', t, t);
    execute format('create policy "%s: employees update" on public.%I for update to authenticated
                    using ((select private.is_employee())) with check ((select private.is_employee()))', t, t);
    execute format('create policy "%s: employees delete" on public.%I for delete to authenticated
                    using ((select private.is_employee()))', t, t);
  end loop;
end $$;

-- Prices and price books: employees only.
do $$
declare t text;
begin
  foreach t in array array['price_books', 'product_prices', 'modifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "%s: employees only" on public.%I for all to authenticated
                    using ((select private.is_employee())) with check ((select private.is_employee()))', t, t);
  end loop;
end $$;
