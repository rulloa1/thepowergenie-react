-- Power Genie owner dashboard.
-- Safe to run more than once in the Supabase SQL editor.
-- This script does not create logins. Those steps are in SETUP.md.

create extension if not exists btree_gist;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_dashboard_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_dashboard_user() from public, anon;
grant execute on function public.is_dashboard_user() to authenticated;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  created_at timestamptz not null default now(),
  constraint chat_messages_has_content check (
    char_length(btrim(body)) > 0 or attachment_path is not null
  )
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  customer_address text not null,
  note text,
  google_event_id text,
  calendar_sync_error text,
  created_by uuid references public.profiles (id) on delete set null,
  source text not null check (source in ('public', 'dashboard')),
  created_at timestamptz not null default now(),
  constraint appointments_one_hour check (ends_at = starts_at + interval '1 hour')
);

-- Confirmed calls cannot overlap. Cancelled rows are ignored.
-- The range is half-open, so 9–10 and 10–11 are allowed side by side.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_no_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
      where (status = 'confirmed');
  end if;
end $$;

-- Refresh token for Horace's Google account. The browser is not granted access.
create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  refresh_token text not null,
  google_email text,
  calendar_id text not null default 'primary',
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists google_calendar_one_connection
  on public.google_calendar_connections ((true));

create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);

create index if not exists files_created_at_idx
  on public.files (created_at desc);

create index if not exists appointments_starts_at_idx
  on public.appointments (starts_at);

alter table public.chat_messages replica identity full;

alter table public.profiles enable row level security;
alter table public.chat_messages enable row level security;
alter table public.files enable row level security;
alter table public.appointments enable row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.oauth_states enable row level security;

drop policy if exists profiles_select_dashboard on public.profiles;
create policy profiles_select_dashboard
  on public.profiles
  for select
  to authenticated
  using (public.is_dashboard_user());

drop policy if exists chat_select_dashboard on public.chat_messages;
create policy chat_select_dashboard
  on public.chat_messages
  for select
  to authenticated
  using (public.is_dashboard_user());

drop policy if exists chat_insert_dashboard on public.chat_messages;
create policy chat_insert_dashboard
  on public.chat_messages
  for insert
  to authenticated
  with check (
    public.is_dashboard_user()
    and sender_id = auth.uid()
  );

drop policy if exists files_select_dashboard on public.files;
create policy files_select_dashboard
  on public.files
  for select
  to authenticated
  using (public.is_dashboard_user());

drop policy if exists files_insert_dashboard on public.files;
create policy files_insert_dashboard
  on public.files
  for insert
  to authenticated
  with check (
    public.is_dashboard_user()
    and uploaded_by = auth.uid()
  );

drop policy if exists files_delete_dashboard on public.files;
create policy files_delete_dashboard
  on public.files
  for delete
  to authenticated
  using (public.is_dashboard_user());

drop policy if exists appointments_select_dashboard on public.appointments;
create policy appointments_select_dashboard
  on public.appointments
  for select
  to authenticated
  using (public.is_dashboard_user());

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.chat_messages from public, anon, authenticated;
revoke all on table public.files from public, anon, authenticated;
revoke all on table public.appointments from public, anon, authenticated;
revoke all on table public.google_calendar_connections from public, anon, authenticated;
revoke all on table public.oauth_states from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert on table public.chat_messages to authenticated;
grant select, insert, delete on table public.files to authenticated;
grant select on table public.appointments to authenticated;

grant all on table public.google_calendar_connections to service_role;
grant all on table public.oauth_states to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('dashboard-files', 'dashboard-files', false, 26214400)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists dashboard_files_select on storage.objects;
create policy dashboard_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'dashboard-files'
    and public.is_dashboard_user()
  );

drop policy if exists dashboard_files_insert on storage.objects;
create policy dashboard_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'dashboard-files'
    and public.is_dashboard_user()
  );

drop policy if exists dashboard_files_delete on storage.objects;
create policy dashboard_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'dashboard-files'
    and public.is_dashboard_user()
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication was not found. In Supabase, open Database → Publications and add chat_messages.';
end $$;

comment on table public.appointments is
  'Customer calls. Confirmed rows cannot overlap.';
comment on table public.google_calendar_connections is
  'Google refresh token for Horace. Browser access is blocked; server functions only.';
comment on table public.chat_messages is
  'Shared room for the owner and admin.';
