-- 0006 (run by hand in the Supabase SQL Editor, 2026-10-01): give the 3 existing
-- auth accounts (all employees) the profiles rows they never got.
insert into public.profiles (id, role)
select u.id, 'employee' from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
