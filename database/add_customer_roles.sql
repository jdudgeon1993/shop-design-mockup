-- ============================================================================
-- Design Lab — Customer accounts + role-based access
-- ============================================================================
-- Every employee-only policy written so far (Catalog Admin writes, consultation
-- rooms, catalogs) gates on `auth.role() = 'authenticated'`. That was a safe
-- stand-in for "is an employee" only because, until now, nobody but an
-- employee could ever get a Supabase account (they're created manually in
-- the Supabase dashboard). The new DIY storefront lets any homeowner create
-- a real account too — so "authenticated" no longer means "employee," and
-- every one of those policies needs to check an actual role instead.
--
-- Roles today: 'employee' and 'customer' only (Client/Designer are a real
-- future need per the team, but nothing needs them yet — add a new allowed
-- value + policies for those later, this doesn't need to anticipate them).
--
-- Paste into the Supabase SQL Editor once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Profiles — one row per auth user, holding the role that actually gates
--    access. auth.users itself can't be altered directly in Supabase, so
--    role lives alongside it here instead.
-- ----------------------------------------------------------------------------
create table profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    role        text not null default 'customer' check (role in ('employee', 'customer')),
    created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile" on profiles
    for select using (auth.uid() = id);

-- Backfill: the trigger below only fires for signups from this point
-- forward. Every account that already exists (including your own employee
-- logins) needs a row too, or is_employee() has nothing to find for them —
-- this gives everyone a starting 'customer' row; the manual step at the
-- bottom of this file is what promotes your actual employees.
insert into profiles (id, role)
select id, 'customer' from auth.users
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Auto-create a profile the moment someone signs up, defaulting to
--    'customer' — this is what the DIY storefront's real account creation
--    relies on. security definer + a fixed search_path is the standard safe
--    pattern for a trigger that needs to write into a table the triggering
--    user doesn't have insert rights on yet.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, role) values (new.id, 'customer');
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. is_employee() — the one helper every employee-only policy below calls.
--    security definer so it can read `profiles` regardless of that table's
--    own RLS (avoids the classic recursive-policy trap of a policy on
--    `profiles` indirectly depending on a read of `profiles`).
-- ----------------------------------------------------------------------------
create or replace function is_employee()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from profiles where id = auth.uid() and role = 'employee'
    );
$$;

-- Now that is_employee() exists, employees can also read every profile
-- (useful later for any admin-side account management) — a user's own row
-- is still readable via the policy above regardless.
create policy "Employees can read every profile" on profiles
    for select using (is_employee());

-- ----------------------------------------------------------------------------
-- 4. Re-point every existing employee-only policy at is_employee() instead
--    of the old "any authenticated user" check. Same policy names, same
--    tables — just the condition changes, so nothing else needs to be
--    touched. drop-if-exists first so this is safe to run even if a policy
--    below doesn't exist yet in your project.
-- ----------------------------------------------------------------------------

-- consultation_rooms
drop policy if exists "Employees can read rooms" on consultation_rooms;
create policy "Employees can read rooms" on consultation_rooms
    for select using (is_employee());
drop policy if exists "Employees can add rooms" on consultation_rooms;
create policy "Employees can add rooms" on consultation_rooms
    for insert with check (is_employee());
drop policy if exists "Employees can delete rooms" on consultation_rooms;
create policy "Employees can delete rooms" on consultation_rooms
    for delete using (is_employee());

-- catalog write policies
drop policy if exists "Employees can add tiers" on tiers;
create policy "Employees can add tiers" on tiers
    for insert with check (is_employee());
drop policy if exists "Employees can add room types" on room_types;
create policy "Employees can add room types" on room_types
    for insert with check (is_employee());
drop policy if exists "Employees can add brands" on brands;
create policy "Employees can add brands" on brands
    for insert with check (is_employee());
drop policy if exists "Employees can add cabinet categories" on cabinet_categories;
create policy "Employees can add cabinet categories" on cabinet_categories
    for insert with check (is_employee());
drop policy if exists "Employees can add cabinets" on cabinets;
create policy "Employees can add cabinets" on cabinets
    for insert with check (is_employee());
drop policy if exists "Employees can add cabinet dimensions" on cabinet_dimensions;
create policy "Employees can add cabinet dimensions" on cabinet_dimensions
    for insert with check (is_employee());
drop policy if exists "Employees can add option categories" on option_categories;
create policy "Employees can add option categories" on option_categories
    for insert with check (is_employee());
drop policy if exists "Employees can add options" on options;
create policy "Employees can add options" on options
    for insert with check (is_employee());
drop policy if exists "Employees can add brand options" on brand_options;
create policy "Employees can add brand options" on brand_options
    for insert with check (is_employee());
drop policy if exists "Employees can remove brand options" on brand_options;
create policy "Employees can remove brand options" on brand_options
    for delete using (is_employee());

-- catalogs
drop policy if exists "Employees can add catalogs" on catalogs;
create policy "Employees can add catalogs" on catalogs
    for insert with check (is_employee());

-- ============================================================================
-- One manual step this script can't do for you: mark your EXISTING employee
-- accounts as employees. The backfill above gave every current account —
-- employees included — a 'customer' row, since there's no way for this
-- script to know which of your existing users are staff.
-- Run this once, filled in with your team's actual emails:
-- ============================================================================
-- update profiles set role = 'employee' where id in (
--     select id from auth.users where email in (
--         'you@shopdesignlab.com',
--         'someone-else@shopdesignlab.com'
--     )
-- );
