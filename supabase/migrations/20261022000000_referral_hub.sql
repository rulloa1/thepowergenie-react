-- The Power Genie by Sunrun — Referral Hub
-- Owner dashboard (chat, files, schedule) + public booking page.
--
-- Security model
--   * Only invited users listed in hub_allowlist become dashboard members (hub_profiles).
--   * Dashboard members can read appointments, chat, files and light bills.
--   * Appointments are written ONLY by Edge Functions using the service role, so every
--     write also goes through the Google Calendar sync and the server-side slot checks.
--   * Public visitors (anon) have no table or storage access at all. Booking and slot
--     listing happen through the `booking` Edge Function, which returns start times only.
--   * The Google refresh token lives in hub_google_credentials, which has RLS on and no
--     policies: only the service role (Edge Functions) can read it.

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create table if not exists public.hub_allowlist (
  email      text primary key check (email = lower(email)),
  role       text not null check (role in ('owner', 'admin')),
  full_name  text,
  created_at timestamptz not null default now()
);
alter table public.hub_allowlist enable row level security;
-- No policies: managed from the Supabase SQL editor / service role only.

insert into public.hub_allowlist (email, role, full_name) values
  ('horace.lawrence@sunrun.com', 'owner', 'Horace Lawrence'),
  ('roryulloa@gmail.com',        'admin', 'Rory Ulloa')
on conflict (email) do nothing;

create table if not exists public.hub_profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.hub_profiles enable row level security;

create or replace function public.hub_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited public.hub_allowlist%rowtype;
begin
  select * into invited from public.hub_allowlist where email = lower(new.email);
  if found then
    insert into public.hub_profiles (id, email, full_name, role)
    values (new.id, lower(new.email), invited.full_name, invited.role)
    on conflict (id) do update set role = excluded.role, full_name = coalesce(public.hub_profiles.full_name, excluded.full_name);
  end if;
  return new;
exception when others then
  -- Never block an auth.users insert (this project is shared with the Hearth portal).
  raise warning 'hub_handle_new_user skipped for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists hub_on_auth_user_created on auth.users;
create trigger hub_on_auth_user_created
  after insert on auth.users
  for each row execute function public.hub_handle_new_user();

-- Users who already exist in auth.users when this migration runs.
insert into public.hub_profiles (id, email, full_name, role)
select u.id, lower(u.email), a.full_name, a.role
from auth.users u
join public.hub_allowlist a on a.email = lower(u.email)
on conflict (id) do nothing;

create or replace function public.is_hub_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hub_profiles where id = (select auth.uid()));
$$;

create or replace function public.is_hub_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hub_profiles where id = (select auth.uid()) and role = 'owner');
$$;

revoke all on function public.hub_handle_new_user() from public, anon, authenticated;

drop policy if exists "members read profiles" on public.hub_profiles;
create policy "members read profiles" on public.hub_profiles
  for select to authenticated using (public.is_hub_member());

-- ---------------------------------------------------------------------------
-- Appointments
-- btree_gist supports the GiST exclusion constraint below. Creating the
-- extension does not change existing tables.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist with schema extensions;

create table if not exists public.hub_appointments (
  id                uuid primary key default gen_random_uuid(),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  during            tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status            text not null default 'booked' check (status in ('booked', 'cancelled')),
  source            text not null check (source in ('public', 'dashboard')),
  customer_name     text not null check (char_length(customer_name) between 1 and 120),
  phone             text check (char_length(phone) <= 40),
  email             text check (char_length(email) <= 254),
  address           text check (char_length(address) <= 300),
  note              text check (char_length(note) <= 1000),
  google_event_id   text,
  google_sync_error text,
  client_ip_hash    text, -- salted hash of the booking IP, for rate limiting only
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users (id) on delete set null,
  constraint hub_appointments_valid_range check (ends_at > starts_at),
  -- Backstop: two booked appointments can never overlap, even if two requests race.
  constraint hub_appointments_no_overlap exclude using gist (during with &&) where (status = 'booked')
);
create index if not exists hub_appointments_starts_at_idx on public.hub_appointments (starts_at);
create index if not exists hub_appointments_ip_created_idx on public.hub_appointments (client_ip_hash, created_at);
create index if not exists hub_appointments_email_idx on public.hub_appointments (email);
alter table public.hub_appointments enable row level security;

drop policy if exists "members read appointments" on public.hub_appointments;
create policy "members read appointments" on public.hub_appointments
  for select to authenticated using (public.is_hub_member());
-- No insert/update/delete policies: writes go through the `booking` and `schedule`
-- Edge Functions (service role) so Google Calendar always stays in sync.

create table if not exists public.hub_appointment_files (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.hub_appointments (id) on delete cascade,
  kind           text not null default 'light_bill' check (kind in ('light_bill')),
  bucket         text not null default 'hub-light-bills',
  storage_path   text not null unique,
  original_name  text,
  content_type   text,
  size_bytes     bigint,
  created_at     timestamptz not null default now()
);
create index if not exists hub_appointment_files_appointment_idx on public.hub_appointment_files (appointment_id);
alter table public.hub_appointment_files enable row level security;

drop policy if exists "members read appointment files" on public.hub_appointment_files;
create policy "members read appointment files" on public.hub_appointment_files
  for select to authenticated using (public.is_hub_member());

-- ---------------------------------------------------------------------------
-- Google Calendar connection (server-side only)
-- ---------------------------------------------------------------------------

create table if not exists public.hub_google_credentials (
  id            smallint primary key default 1 check (id = 1), -- one connected calendar (Horace's)
  connected_by  uuid references auth.users (id) on delete set null,
  google_email  text,
  calendar_id   text not null default 'primary',
  refresh_token text not null,
  scope         text,
  connected_at  timestamptz not null default now()
);
alter table public.hub_google_credentials enable row level security;
revoke all on table public.hub_google_credentials from anon, authenticated;
-- No policies on purpose: only the service role can read the refresh token.

-- ---------------------------------------------------------------------------
-- Chat (one shared room)
-- ---------------------------------------------------------------------------

create table if not exists public.hub_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references public.hub_profiles (id) on delete cascade,
  body            text check (char_length(body) <= 4000),
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at      timestamptz not null default now(),
  constraint hub_chat_message_not_empty check (coalesce(char_length(body), 0) > 0 or attachment_path is not null)
);
create index if not exists hub_chat_messages_created_idx on public.hub_chat_messages (created_at desc);
alter table public.hub_chat_messages enable row level security;

drop policy if exists "members read chat" on public.hub_chat_messages;
create policy "members read chat" on public.hub_chat_messages
  for select to authenticated using (public.is_hub_member());

drop policy if exists "members send chat as themselves" on public.hub_chat_messages;
create policy "members send chat as themselves" on public.hub_chat_messages
  for insert to authenticated
  with check (public.is_hub_member() and sender_id = (select auth.uid()));

drop policy if exists "members delete own chat" on public.hub_chat_messages;
create policy "members delete own chat" on public.hub_chat_messages
  for delete to authenticated
  using (public.is_hub_member() and sender_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hub_chat_messages'
  ) then
    alter publication supabase_realtime add table public.hub_chat_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage (all private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('hub-files',        'hub-files',        false, 52428800, null),
  ('hub-chat', 'hub-chat', false, 26214400, null),
  ('hub-light-bills',      'hub-light-bills',      false, 10485760,
     array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dashboard documents and chat attachments: members only, full access.
drop policy if exists "hub members read hub files" on storage.objects;
create policy "hub members read hub files" on storage.objects
  for select to authenticated
  using (bucket_id in ('hub-files', 'hub-chat') and public.is_hub_member());

drop policy if exists "hub members upload hub files" on storage.objects;
create policy "hub members upload hub files" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('hub-files', 'hub-chat') and public.is_hub_member());

drop policy if exists "hub members update hub files" on storage.objects;
create policy "hub members update hub files" on storage.objects
  for update to authenticated
  using (bucket_id in ('hub-files', 'hub-chat') and public.is_hub_member());

drop policy if exists "hub members delete hub files" on storage.objects;
create policy "hub members delete hub files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('hub-files', 'hub-chat') and public.is_hub_member());

-- Light bills: uploaded only by the booking Edge Function (service role).
-- Members can read them (via short-lived signed URLs). Nobody else can list or read.
drop policy if exists "hub members read light bills" on storage.objects;
create policy "hub members read light bills" on storage.objects
  for select to authenticated
  using (bucket_id = 'hub-light-bills' and public.is_hub_member());

-- ---------------------------------------------------------------------------
-- Explicit grants. This project's default privileges do NOT grant table or
-- function access to anon/authenticated/service_role, so grant exactly what the
-- Edge Functions (service_role) and the dashboard (authenticated + RLS) need.
-- anon gets nothing.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.hub_allowlist, public.hub_profiles, public.hub_appointments,
  public.hub_appointment_files, public.hub_google_credentials, public.hub_chat_messages
  to service_role;

grant select on public.hub_profiles, public.hub_appointments, public.hub_appointment_files
  to authenticated;
grant select, insert, delete on public.hub_chat_messages to authenticated;

grant execute on function public.is_hub_member(), public.is_hub_owner() to authenticated, service_role;
revoke execute on function public.is_hub_member(), public.is_hub_owner() from public, anon;
