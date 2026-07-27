-- ============================================================================
-- Design Lab — Add Room Types (incremental migration)
-- ============================================================================
-- catalog_schema.sql is already applied to the live Supabase project, so this
-- is a standalone add-on, not a re-run of that file. Paste this into the
-- Supabase SQL Editor once. It only adds new structure — no existing rows in
-- tiers/brands/cabinets/etc. are touched.
--
-- What this adds: a room_types table (Kitchen, Bath, Garage, Closet, ...) and
-- a link from cabinet_categories to room_types, so the DIY flow can filter by
-- room before brand. A category (Base, Wall, Vanity, ...) belongs to one
-- room; a brand's available room types are whatever rooms its cabinets'
-- categories belong to — no changes needed to brands or cabinets themselves.
-- ============================================================================

create table room_types (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,      -- 'Kitchen', 'Bath', 'Garage', 'Closet'
    slug        text not null unique,
    image_url   text,
    sort_order  int not null default 0
);

alter table cabinet_categories
    add column room_type_id uuid references room_types(id);

-- New table needs the same public-read policy as everything else in this
-- catalog — no login required to browse, matching the storefront.
alter table room_types enable row level security;
create policy "Public read access" on room_types for select using (true);

-- After running this, add your room type rows (Kitchen/Bath/Garage/Closet) in
-- Table Editor, then go back to each existing cabinet_categories row and set
-- its room_type_id — that's what makes a category (and therefore its
-- brand/cabinets) show up under the right room in the DIY flow.
