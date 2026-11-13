-- 0031: Messages from the storefront's Connect page (/connect/).
-- Visitors can only send a message; nobody but employees can read them or mark them handled.
-- Shown in the employee dashboard under "Messages".
create table public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  email       text not null check (char_length(email) between 5 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or char_length(phone) <= 40),
  role        text not null default 'homeowner' check (role in ('homeowner', 'designer', 'contractor', 'other')),
  topic       text not null default 'project' check (topic in ('project', 'designer', 'order', 'samples', 'other')),
  message     text not null check (char_length(btrim(message)) between 1 and 4000),
  prefer      text not null default 'email' check (prefer in ('email', 'phone')),
  source      text check (char_length(source) <= 120),
  status      text not null default 'new' check (status in ('new', 'handled')),
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;

-- Visitors: insert only, and only as a fresh, unhandled message.
create policy "contact_messages: anyone can send" on public.contact_messages
  for insert to anon, authenticated with check (status = 'new' and handled_at is null);
create policy "contact_messages: employees read" on public.contact_messages
  for select to authenticated using ((select private.is_employee()));
create policy "contact_messages: employees update" on public.contact_messages
  for update to authenticated using ((select private.is_employee())) with check ((select private.is_employee()));

-- Employees may only change the status fields.
revoke update on public.contact_messages from anon, authenticated;
grant update (status, handled_at) on public.contact_messages to authenticated;

comment on table public.contact_messages is 'Messages from the Connect page. Insert-only for visitors; employees read them and mark them handled.';
