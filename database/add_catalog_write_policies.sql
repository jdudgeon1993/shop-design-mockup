-- ============================================================================
-- Design Lab — Catalog write policies (for the new Catalog Admin tool)
-- ============================================================================
-- catalog_schema.sql only ever granted public READ on these tables — nothing,
-- including an employee, could write to them yet (writes went through the
-- Supabase dashboard directly). This adds INSERT, scoped to signed-in
-- employees only, matching the pattern already used for consultation_rooms.
-- Public/anonymous visitors still can't write — only read, unchanged.
--
-- brand_options also gets DELETE, since the admin tool's "which options does
-- this brand allow" panel is a checkbox toggle: checking inserts a row,
-- unchecking deletes it.
--
-- Editing or deleting existing rows in the other tables (fixing a typo, etc.)
-- isn't part of this tool yet — Supabase's own Table Editor is still how you'd
-- do that for now.
--
-- Paste into the Supabase SQL Editor once.
-- ============================================================================

create policy "Employees can add tiers" on tiers for insert with check (auth.role() = 'authenticated');
create policy "Employees can add room types" on room_types for insert with check (auth.role() = 'authenticated');
create policy "Employees can add brands" on brands for insert with check (auth.role() = 'authenticated');
create policy "Employees can add cabinet categories" on cabinet_categories for insert with check (auth.role() = 'authenticated');
create policy "Employees can add cabinets" on cabinets for insert with check (auth.role() = 'authenticated');
create policy "Employees can add cabinet dimensions" on cabinet_dimensions for insert with check (auth.role() = 'authenticated');
create policy "Employees can add option categories" on option_categories for insert with check (auth.role() = 'authenticated');
create policy "Employees can add options" on options for insert with check (auth.role() = 'authenticated');

create policy "Employees can add brand options" on brand_options for insert with check (auth.role() = 'authenticated');
create policy "Employees can remove brand options" on brand_options for delete using (auth.role() = 'authenticated');
