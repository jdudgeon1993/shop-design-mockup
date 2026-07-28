-- ============================================================================
-- Design Lab — Catalogs (multi-product-line support)
-- ============================================================================
-- Everything built so far (tiers, brands, cabinets, options...) only ever
-- modeled one product line. This adds "Catalog" as a top-level grouping so a
-- future product line (granite, sinks, whatever) can reuse these exact same
-- tables scoped to its own catalog, instead of a brand-new schema per
-- product type or mixing everything together — catalogs are strict, nothing
-- in one can be combined with another.
--
-- catalog_id lives on the three root tables only — tiers, room_types,
-- option_categories. Everything else (brands, cabinet_categories, cabinets,
-- options, brand_options, cabinet_dimensions) already hangs off one of those
-- through an existing foreign key, so it inherits its catalog for free; the
-- Catalog Admin tool computes that inherited catalog client-side rather than
-- storing it redundantly.
--
-- Also re-scopes name/slug uniqueness to be per-catalog instead of global —
-- otherwise a future "Granite" catalog could never have a tier also named
-- "Entry" just because the Cabinets catalog already used that name.
--
-- Paste into the Supabase SQL Editor once. Existing rows are backfilled into
-- a "Cabinets" catalog automatically, so nothing currently live changes.
-- ============================================================================

create table catalogs (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,
    slug        text not null unique,
    sort_order  int  not null default 0,
    created_at  timestamptz not null default now()
);

insert into catalogs (name, slug, sort_order) values ('Cabinets', 'cabinets', 0);

-- ---- Tiers ----
alter table tiers add column catalog_id uuid references catalogs(id);
update tiers set catalog_id = (select id from catalogs where slug = 'cabinets');
alter table tiers alter column catalog_id set not null;
alter table tiers drop constraint tiers_name_key;
alter table tiers add constraint tiers_catalog_id_name_key unique (catalog_id, name);
create index tiers_catalog_id_idx on tiers (catalog_id);

-- ---- Room types ----
alter table room_types add column catalog_id uuid references catalogs(id);
update room_types set catalog_id = (select id from catalogs where slug = 'cabinets');
alter table room_types alter column catalog_id set not null;
alter table room_types drop constraint room_types_name_key;
alter table room_types drop constraint room_types_slug_key;
alter table room_types add constraint room_types_catalog_id_name_key unique (catalog_id, name);
alter table room_types add constraint room_types_catalog_id_slug_key unique (catalog_id, slug);
create index room_types_catalog_id_idx on room_types (catalog_id);

-- ---- Option categories ----
alter table option_categories add column catalog_id uuid references catalogs(id);
update option_categories set catalog_id = (select id from catalogs where slug = 'cabinets');
alter table option_categories alter column catalog_id set not null;
alter table option_categories drop constraint option_categories_name_key;
alter table option_categories add constraint option_categories_catalog_id_name_key unique (catalog_id, name);
create index option_categories_catalog_id_idx on option_categories (catalog_id);

-- ============================================================================
-- Row Level Security — same public-read / employee-write pattern as every
-- other catalog table.
-- ============================================================================
alter table catalogs enable row level security;
create policy "Public read access" on catalogs for select using (true);
create policy "Employees can add catalogs" on catalogs for insert with check (auth.role() = 'authenticated');
