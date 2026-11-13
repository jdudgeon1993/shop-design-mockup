-- 0028: Google Meet rooms. One permanent "Team Meet" room plus one personal
-- consultation room per employee, each a reusable Meet code (from a repeating
-- Google Calendar event, so the link never expires).
--
--   employees  see every room; set or change their OWN personal room
--   admins     (the admin tag) change any room, including the team room
--   clients    (anon) can only look up a PERSONAL room by its slug, through
--              public.consultation_room(slug): /consultation/meet/?d=jordan.
--              The team room is never exposed to them.
--
-- Knocking still applies: anyone with a Meet link has to be admitted by the host.

create table public.meet_rooms (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('team', 'personal')),
  profile_id  uuid references public.profiles(id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  label       text not null check (length(trim(label)) between 1 and 60),
  meet_code   text not null check (meet_code ~ '^[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  updated_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  check ((kind = 'team') = (profile_id is null))
);
create unique index meet_rooms_one_team on public.meet_rooms (kind) where kind = 'team';
create unique index meet_rooms_one_per_person on public.meet_rooms (profile_id) where profile_id is not null;
create index meet_rooms_updated_by_idx on public.meet_rooms (updated_by);

create or replace function private.meet_rooms_touch()
 returns trigger language plpgsql set search_path to ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger meet_rooms_touch before update on public.meet_rooms
  for each row execute function private.meet_rooms_touch();

alter table public.meet_rooms enable row level security;
revoke all on public.meet_rooms from anon;
grant select, insert, update, delete on public.meet_rooms to authenticated;

create policy meet_rooms_read on public.meet_rooms for select to authenticated
  using ((select private.is_employee()));
create policy meet_rooms_insert on public.meet_rooms for insert to authenticated
  with check ((select private.is_employee()) and (
    (kind = 'personal' and profile_id = (select auth.uid())) or (select private.has_tag('admin'))));
create policy meet_rooms_update on public.meet_rooms for update to authenticated
  using ((select private.is_employee()) and (
    (kind = 'personal' and profile_id = (select auth.uid())) or (select private.has_tag('admin'))))
  with check ((select private.is_employee()) and (
    (kind = 'personal' and profile_id = (select auth.uid())) or (select private.has_tag('admin'))));
create policy meet_rooms_delete on public.meet_rooms for delete to authenticated
  using ((select private.is_employee()) and (
    (kind = 'personal' and profile_id = (select auth.uid())) or (select private.has_tag('admin'))));

-- Clients: a designer's personal room by slug. Only the name to greet them with
-- and the Meet code; never the team room, never who owns it.
create or replace function public.consultation_room(p_slug text)
 returns table (label text, meet_code text)
 language sql stable security definer set search_path to ''
as $$
  select r.label, r.meet_code from public.meet_rooms r
   where r.kind = 'personal' and r.slug = lower(trim(p_slug));
$$;
revoke all on function public.consultation_room(text) from public;
grant execute on function public.consultation_room(text) to anon, authenticated;

-- The team room (from the weekly Google Calendar event).
insert into public.meet_rooms (kind, slug, label, meet_code, updated_by)
values ('team', 'team', 'Team Meet', 'syy-sfxq-cdq', null);
