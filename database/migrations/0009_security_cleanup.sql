-- 0009_security_cleanup.sql
-- Fixes from the Supabase security advisor on the original experimental tables.

-- get_schema_map(): lets anyone (even logged out) list every table and column. Not used by the site.
drop function if exists public.get_schema_map();

-- public.is_employee(): superseded by private.is_employee() (not callable through the API).
drop function if exists public.is_employee();

-- handle_new_user(): only the signup trigger should run it, never the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- profiles: RLS was on with no policies, so nobody could read even their own profile.
-- Roles are still only changed in the Supabase dashboard / SQL editor.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists company text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'designer', 'employee', 'admin'));

create policy "profiles: read own or employee" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_employee()));
create policy "profiles: update own details" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, company) on public.profiles to authenticated;

-- consultation_rooms: RLS was on with no policies, so the dashboard couldn't create or list rooms.
create policy "consultation_rooms: employees read" on public.consultation_rooms for select to authenticated
  using ((select private.is_employee()));
create policy "consultation_rooms: employees insert" on public.consultation_rooms for insert to authenticated
  with check ((select private.is_employee()));
create policy "consultation_rooms: employees delete" on public.consultation_rooms for delete to authenticated
  using ((select private.is_employee()));
create index if not exists consultation_rooms_created_by_idx on public.consultation_rooms (created_by);

-- addresses: same rule, rewritten so auth.uid() is evaluated once per query, not per row.
drop policy if exists "own addresses" on public.addresses;
create policy "addresses: own" on public.addresses for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
