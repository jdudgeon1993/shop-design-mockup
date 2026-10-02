-- 0002_private_helpers.sql
-- Private schema for catalog helpers and anything the public API must never expose.
-- Reads the existing public.profiles.role; does not modify profiles or the existing
-- public.is_employee() function.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- RLS policies call private.is_employee() as the signed-in user, so they need usage + execute.
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the signed-in user's profile role is employee or admin.
create or replace function private.is_employee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('employee', 'admin')
  );
$$;
revoke all on function private.is_employee() from public, anon;
grant execute on function private.is_employee() to authenticated;
