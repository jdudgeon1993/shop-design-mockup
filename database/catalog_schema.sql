-- ============================================================================
-- Design Lab — DIY Catalog Schema (draft)
-- ============================================================================
-- Models the "Choose a cabinet -> Customize via fields" DIY flow: browse a
-- tier, browse a brand's real catalog of cabinet SKUs within that tier, pick
-- one or more, then customize each via its brand's allowed options.
--
-- Scope: catalog data only (tiers, brands, cabinets, customization options,
-- and which options each brand/cabinet actually allows). Orders/cart/checkout
-- are a separate schema to design once this is filled in and stable — this
-- file intentionally stops at "what can be browsed and configured," not
-- "what a customer bought."
--
-- Paste this directly into the Supabase SQL Editor. Safe to re-run: DROP
-- statements are commented out below the CREATE statements if you need to
-- reset while iterating.
-- ============================================================================

create extension if not exists pgcrypto; -- provides gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. Tiers — Entry / Middle / High End
-- ----------------------------------------------------------------------------
create table tiers (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,       -- 'Entry', 'Middle', 'High End'
    sort_order  int  not null default 0,
    created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Brands — the 5-6 vendor lines, each belonging to exactly one tier.
--    (2 Entry, 2 Middle, 1 High End per current planning.)
-- ----------------------------------------------------------------------------
create table brands (
    id              uuid primary key default gen_random_uuid(),
    tier_id         uuid not null references tiers(id),
    name            text not null,
    slug            text not null unique,   -- for URLs, e.g. 'northridge-cabinetry'
    description     text,
    logo_url        text,
    hero_image_url  text,
    -- Orders can't mix brands in one purchase — each vendor ships
    -- independently and freight/consistency breaks down across brands
    -- (established constraint). Enforced at the order/checkout layer, not
    -- here, but noted for context when that schema gets designed.
    active          boolean not null default true,
    sort_order      int not null default 0,
    created_at      timestamptz not null default now()
);
create index brands_tier_id_idx on brands (tier_id);

-- ----------------------------------------------------------------------------
-- 3. Cabinet categories — shared vocabulary across every brand's catalog
--    (Base, Wall, Tall, Pantry, ...). Not brand-specific.
-- ----------------------------------------------------------------------------
create table cabinet_categories (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,       -- 'Base', 'Wall', 'Tall', 'Pantry'
    sort_order  int not null default 0
);

-- ----------------------------------------------------------------------------
-- 4. Cabinets — the real catalog of physical SKUs a brand sells. This is
--    what "Choose a cabinet(s)" actually browses, one row per real model.
-- ----------------------------------------------------------------------------
create table cabinets (
    id           uuid primary key default gen_random_uuid(),
    brand_id     uuid not null references brands(id),
    category_id  uuid not null references cabinet_categories(id),
    sku          text not null,             -- the vendor's own model number
    name         text not null,             -- 'B24 - 24" Base Cabinet, 2-Door'
    width_in     numeric(6,2),
    height_in    numeric(6,2),
    depth_in     numeric(6,2),
    base_price   numeric(10,2) not null,
    image_url    text,
    description  text,
    active       boolean not null default true,
    created_at   timestamptz not null default now(),
    unique (brand_id, sku)
);
create index cabinets_brand_id_idx on cabinets (brand_id);
create index cabinets_category_id_idx on cabinets (category_id);

-- ----------------------------------------------------------------------------
-- 5. Option categories — the "customize via fields" step types
--    (Finish, Door Style, Hardware, ...).
-- ----------------------------------------------------------------------------
create table option_categories (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,       -- 'Finish', 'Door Style', 'Hardware'
    sort_order  int not null default 0
);

-- ----------------------------------------------------------------------------
-- 6. Options — the actual selectable values within a category, with their
--    own default price delta (matches the existing DIY wizard's pricing
--    pattern: $0 for the included default, + for upgrades).
-- ----------------------------------------------------------------------------
create table options (
    id                   uuid primary key default gen_random_uuid(),
    option_category_id   uuid not null references option_categories(id),
    name                 text not null,     -- 'Weathered Gray', 'Brass Designer Pull'
    price_modifier       numeric(10,2) not null default 0,
    image_url            text,
    sort_order           int not null default 0,
    created_at           timestamptz not null default now()
);
create index options_option_category_id_idx on options (option_category_id);

-- ----------------------------------------------------------------------------
-- 7. Brand options — THE RESTRICTIONS LAYER. A brand only offers what's
--    listed here, not the full universal set of options across all brands.
--    A brand can also override an option's default price for their line.
-- ----------------------------------------------------------------------------
create table brand_options (
    brand_id                  uuid not null references brands(id),
    option_id                 uuid not null references options(id),
    price_modifier_override   numeric(10,2), -- null = use options.price_modifier
    primary key (brand_id, option_id)
);

-- ----------------------------------------------------------------------------
-- 8. Cabinet option exclusions — fine-grained exceptions for a specific
--    cabinet that can't offer an option its brand otherwise allows (e.g. a
--    compact cabinet that doesn't support a certain hardware pull). Absence
--    of a row here means the brand-level rule (table 7) applies as-is.
-- ----------------------------------------------------------------------------
create table cabinet_option_exclusions (
    cabinet_id  uuid not null references cabinets(id),
    option_id   uuid not null references options(id),
    reason      text,
    primary key (cabinet_id, option_id)
);

-- ============================================================================
-- Row Level Security — this is a public storefront catalog: anyone (no
-- login required) should be able to browse it, matching how the DIY wizard
-- and consultation page's client-facing side already work with no auth.
-- Writes are left to the Supabase dashboard/service role for now — there's
-- no admin UI yet to gate write access through.
-- ============================================================================
alter table tiers enable row level security;
alter table brands enable row level security;
alter table cabinet_categories enable row level security;
alter table cabinets enable row level security;
alter table option_categories enable row level security;
alter table options enable row level security;
alter table brand_options enable row level security;
alter table cabinet_option_exclusions enable row level security;

create policy "Public read access" on tiers for select using (true);
create policy "Public read access" on brands for select using (true);
create policy "Public read access" on cabinet_categories for select using (true);
create policy "Public read access" on cabinets for select using (true);
create policy "Public read access" on option_categories for select using (true);
create policy "Public read access" on options for select using (true);
create policy "Public read access" on brand_options for select using (true);
create policy "Public read access" on cabinet_option_exclusions for select using (true);

-- ============================================================================
-- Reset (commented out — uncomment to wipe and start over while iterating)
-- ============================================================================
-- drop table if exists cabinet_option_exclusions, brand_options, options,
--     option_categories, cabinets, cabinet_categories, brands, tiers cascade;
