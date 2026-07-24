-- ============================================================================
-- Design Lab — Catalog Seed Loader
-- ============================================================================
-- Loads the fillable CSVs in database/seed/ into the real catalog tables
-- from catalog_schema.sql, resolving human-readable names/slugs into the
-- actual UUID foreign keys — so nobody has to hand-copy UUIDs between a
-- spreadsheet and the database. Run catalog_schema.sql first if you haven't.
--
-- HOW TO USE — OPTION A: Supabase Table Editor (no terminal needed)
--   1. Run the "1. Create staging tables" section below in the SQL Editor.
--   2. For each database/seed/*.csv file, open the matching stg_* table in
--      Table Editor and use "Insert" -> "Import data from CSV".
--   3. Run the "2. Resolve into real tables" section below.
--   4. Run the "3. Clean up" section to drop the staging tables.
--
-- HOW TO USE — OPTION B: psql (if you have a Postgres client and the
-- Supabase connection string from Settings -> Database)
--   1. Run the "1. Create staging tables" section.
--   2. From psql, connected to your Supabase database, from the repo root:
--        \copy stg_tiers from 'database/seed/01_tiers.csv' csv header
--        \copy stg_brands from 'database/seed/02_brands.csv' csv header
--        \copy stg_cabinet_categories from 'database/seed/03_cabinet_categories.csv' csv header
--        \copy stg_option_categories from 'database/seed/04_option_categories.csv' csv header
--        \copy stg_options from 'database/seed/05_options.csv' csv header
--        \copy stg_brand_options from 'database/seed/06_brand_options.csv' csv header
--        \copy stg_cabinets from 'database/seed/07_cabinets.csv' csv header
--        \copy stg_cabinet_dimensions from 'database/seed/08_cabinet_dimensions.csv' csv header
--   3. Run the "2. Resolve into real tables" section.
--   4. Run the "3. Clean up" section.
--
-- Safe to re-run: every insert uses "on conflict do nothing" against the
-- schema's unique constraints, so re-running after adding more rows to a
-- staging table won't create duplicates of what's already loaded.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create staging tables — plain text/numeric columns matching the CSV
--    headers exactly, no foreign keys yet.
-- ----------------------------------------------------------------------------
create table if not exists stg_tiers (
    name text, sort_order int
);
create table if not exists stg_brands (
    name text, slug text, tier_name text, description text, sort_order int
);
create table if not exists stg_cabinet_categories (
    name text, sort_order int
);
create table if not exists stg_option_categories (
    name text, sort_order int
);
create table if not exists stg_options (
    option_category_name text, name text, price_modifier numeric
);
create table if not exists stg_brand_options (
    brand_slug text, option_category_name text, option_name text, price_modifier_override numeric
);
create table if not exists stg_cabinets (
    brand_slug text, category_name text, name text, description text
);
create table if not exists stg_cabinet_dimensions (
    brand_slug text, cabinet_name text, sku text, width_in numeric,
    height_in numeric, depth_in numeric, price numeric
);

-- Now load database/seed/*.csv into these via Table Editor or \copy (see
-- instructions above), then continue below.

-- ----------------------------------------------------------------------------
-- 2. Resolve into real tables, in dependency order.
-- ----------------------------------------------------------------------------
insert into tiers (name, sort_order)
select name, sort_order from stg_tiers
on conflict (name) do nothing;

insert into brands (name, slug, tier_id, description, sort_order)
select s.name, s.slug, t.id, s.description, s.sort_order
from stg_brands s
join tiers t on t.name = s.tier_name
on conflict (slug) do nothing;

insert into cabinet_categories (name, sort_order)
select name, sort_order from stg_cabinet_categories
on conflict (name) do nothing;

insert into option_categories (name, sort_order)
select name, sort_order from stg_option_categories
on conflict (name) do nothing;

insert into options (option_category_id, name, price_modifier)
select oc.id, s.name, s.price_modifier
from stg_options s
join option_categories oc on oc.name = s.option_category_name
on conflict (option_category_id, name) do nothing;

insert into brand_options (brand_id, option_id, price_modifier_override)
select b.id, o.id, s.price_modifier_override
from stg_brand_options s
join brands b on b.slug = s.brand_slug
join option_categories oc on oc.name = s.option_category_name
join options o on o.option_category_id = oc.id and o.name = s.option_name
on conflict (brand_id, option_id) do nothing;

insert into cabinets (brand_id, category_id, name, description)
select b.id, cc.id, s.name, s.description
from stg_cabinets s
join brands b on b.slug = s.brand_slug
join cabinet_categories cc on cc.name = s.category_name
on conflict (brand_id, name) do nothing;

insert into cabinet_dimensions (cabinet_id, sku, width_in, height_in, depth_in, price)
select c.id, s.sku, s.width_in, s.height_in, s.depth_in, s.price
from stg_cabinet_dimensions s
join brands b on b.slug = s.brand_slug
join cabinets c on c.brand_id = b.id and c.name = s.cabinet_name
on conflict (cabinet_id, sku) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Clean up — drop the staging tables now that the real data is loaded.
-- ----------------------------------------------------------------------------
drop table if exists stg_cabinet_dimensions, stg_cabinets, stg_brand_options,
    stg_options, stg_option_categories, stg_cabinet_categories, stg_brands, stg_tiers;
