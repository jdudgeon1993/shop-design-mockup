-- 0027: the team's sign-in emails, for the dashboard's Team list. Emails live in
-- auth.users, which the browser can't read; this hands them to team members only.

create or replace function public.team_directory()
 returns table (id uuid, email text, last_sign_in_at timestamptz)
 language sql stable security definer set search_path to ''
as $$
  select u.id, u.email::text, u.last_sign_in_at
    from auth.users u
    join public.profiles p on p.id = u.id and p.role in ('employee', 'admin')
   where (select private.is_employee());
$$;
revoke all on function public.team_directory() from public, anon;
grant execute on function public.team_directory() to authenticated;
