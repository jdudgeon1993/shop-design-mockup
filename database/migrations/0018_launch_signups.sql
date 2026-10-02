-- 0018: "Be first to know" sign-ups for lines that aren't on sale yet (Structure | 3 first).
-- Visitors can only add their email; nobody but employees can read the list.
create table public.launch_signups (
  id         bigint generated always as identity primary key,
  email      text not null check (char_length(email) between 5 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  line       text not null default 'structure-3' check (line ~ '^[a-z0-9-]{2,40}$'),
  source     text check (char_length(source) <= 60),
  created_at timestamptz not null default now()
);
create unique index launch_signups_email_line_key on public.launch_signups (lower(email), line);
alter table public.launch_signups enable row level security;

create policy "launch_signups: anyone can sign up" on public.launch_signups
  for insert to anon, authenticated with check (true);
create policy "launch_signups: employees read" on public.launch_signups
  for select to authenticated using ((select private.is_employee()));

comment on table public.launch_signups is 'Emails asking to be told when a line (e.g. Structure | 3) launches. Insert-only for visitors.';
