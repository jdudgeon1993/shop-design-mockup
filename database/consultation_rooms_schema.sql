-- ============================================================================
-- Design Lab — Consultation Rooms (employee-only tracking)
-- ============================================================================
-- Every video consultation room an employee starts gets a row here, so the
-- "Open Rooms" panel in the employee dashboard can list them for quick
-- copy/send, and let any employee clean up ones that are no longer needed.
--
-- This is internal tooling, not storefront catalog data — unlike
-- catalog_schema.sql's public-read tables, this one requires a signed-in
-- Supabase user (i.e. an employee) for every operation, matching how the
-- dashboard already gates everything behind Supabase Auth.
--
-- Deleting a row here only removes it from this list/tracking. It does NOT
-- forcibly end a call already in progress — Jitsi/JaaS has no concept of
-- this table. If you also need "kick everyone out right now," that's a
-- separate, bigger feature (a server-side call to JaaS's own API with the
-- private key) — say so if that turns out to be needed.
--
-- Paste this into the Supabase SQL Editor once.
-- ============================================================================

create extension if not exists pgcrypto; -- provides gen_random_uuid()

create table consultation_rooms (
    id          uuid primary key default gen_random_uuid(),
    room_name   text not null,
    created_by  text not null,   -- the creating employee's email
    created_at  timestamptz not null default now()
);

alter table consultation_rooms enable row level security;

-- Any signed-in employee can see, add, and remove rows — this is a shared
-- team list ("in case" someone else needs a link), not per-employee data.
create policy "Employees can read rooms" on consultation_rooms
    for select using (auth.role() = 'authenticated');
create policy "Employees can add rooms" on consultation_rooms
    for insert with check (auth.role() = 'authenticated');
create policy "Employees can delete rooms" on consultation_rooms
    for delete using (auth.role() = 'authenticated');

-- ============================================================================
-- Reset (commented out — uncomment to wipe and start over while iterating)
-- ============================================================================
-- drop table if exists consultation_rooms;
