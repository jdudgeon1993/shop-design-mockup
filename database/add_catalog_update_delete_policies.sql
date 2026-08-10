-- ============================================================================
-- Design Lab — Catalog update/delete policies
-- ============================================================================
-- add_catalog_write_policies.sql only ever added INSERT (and, for
-- brand_options, DELETE). The Catalog Admin tool's Edit/Delete buttons call
-- UPDATE and DELETE directly, and Postgres denies by default when no policy
-- exists for an action — so right now those buttons fail against the real
-- database even though they work fine in testing. This is the missing grant,
-- for exactly the 8 tables the admin tool actually has Edit/Delete buttons
-- for (catalogs and brand_options aren't included here on purpose — catalogs
-- has no edit/delete UI yet, and brand_options already has its own delete
-- policy from add_catalog_write_policies.sql).
--
-- Paste into the Supabase SQL Editor once.
-- ============================================================================

create policy "Employees can update tiers" on tiers for update using (is_employee()) with check (is_employee());
create policy "Employees can delete tiers" on tiers for delete using (is_employee());

create policy "Employees can update room types" on room_types for update using (is_employee()) with check (is_employee());
create policy "Employees can delete room types" on room_types for delete using (is_employee());

create policy "Employees can update option categories" on option_categories for update using (is_employee()) with check (is_employee());
create policy "Employees can delete option categories" on option_categories for delete using (is_employee());

create policy "Employees can update brands" on brands for update using (is_employee()) with check (is_employee());
create policy "Employees can delete brands" on brands for delete using (is_employee());

create policy "Employees can update cabinet categories" on cabinet_categories for update using (is_employee()) with check (is_employee());
create policy "Employees can delete cabinet categories" on cabinet_categories for delete using (is_employee());

create policy "Employees can update options" on options for update using (is_employee()) with check (is_employee());
create policy "Employees can delete options" on options for delete using (is_employee());

create policy "Employees can update cabinets" on cabinets for update using (is_employee()) with check (is_employee());
create policy "Employees can delete cabinets" on cabinets for delete using (is_employee());

create policy "Employees can update cabinet dimensions" on cabinet_dimensions for update using (is_employee()) with check (is_employee());
create policy "Employees can delete cabinet dimensions" on cabinet_dimensions for delete using (is_employee());
