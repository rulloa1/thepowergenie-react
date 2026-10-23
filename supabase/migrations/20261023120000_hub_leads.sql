-- Leads tab, bill fields, and per-member seen state.
--
-- Idempotent. Safe to run more than once. It does not drop data.
--
--   * Extra bill columns on powergenie_customers and hub_appointments
--   * Hub-member SELECT on powergenie_customers, powergenie_files,
--     powergenie_activity, and storage bucket `powergenie`
--   * hub_lead_seen so Rory and Horace each get their own New badge
--   * Realtime publication rows for the leads list
--   * Explicit grants. This project does not auto-grant to API roles.
--
-- anon receives nothing. Writes to the powergenie tables stay on the
-- service role (the website assistant). Hub members can mark a lead seen.

-- ---------------------------------------------------------------------------
-- Bill columns
-- ---------------------------------------------------------------------------

alter table public.powergenie_customers
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists esiid text,
  add column if not exists meter_number text,
  add column if not exists tdu text,
  add column if not exists rep_puct_certificate text,
  add column if not exists avg_monthly_kwh double precision,
  add column if not exists usage_history jsonb;

alter table public.hub_appointments
  add column if not exists kwh double precision,
  add column if not exists bill_amount double precision,
  add column if not exists esiid text,
  add column if not exists meter_number text,
  add column if not exists tdu text,
  add column if not exists rep_puct_certificate text,
  add column if not exists avg_monthly_kwh double precision,
  add column if not exists usage_history jsonb;

alter table public.powergenie_customers drop constraint if exists powergenie_customers_phone_len;
alter table public.powergenie_customers
  add constraint powergenie_customers_phone_len check (phone is null or char_length(phone) <= 40);
alter table public.powergenie_customers drop constraint if exists powergenie_customers_email_len;
alter table public.powergenie_customers
  add constraint powergenie_customers_email_len check (email is null or char_length(email) <= 254);
alter table public.powergenie_customers drop constraint if exists powergenie_customers_esiid_digits;
alter table public.powergenie_customers
  add constraint powergenie_customers_esiid_digits check (esiid is null or esiid ~ '^[0-9]{17,22}$');
alter table public.powergenie_customers drop constraint if exists powergenie_customers_meter_len;
alter table public.powergenie_customers
  add constraint powergenie_customers_meter_len check (meter_number is null or char_length(meter_number) <= 40);
alter table public.powergenie_customers drop constraint if exists powergenie_customers_tdu_len;
alter table public.powergenie_customers
  add constraint powergenie_customers_tdu_len check (tdu is null or char_length(tdu) <= 80);
alter table public.powergenie_customers drop constraint if exists powergenie_customers_puct_len;
alter table public.powergenie_customers
  add constraint powergenie_customers_puct_len check (rep_puct_certificate is null or char_length(rep_puct_certificate) <= 12);
alter table public.powergenie_customers drop constraint if exists powergenie_customers_avg_monthly_nonneg;
alter table public.powergenie_customers
  add constraint powergenie_customers_avg_monthly_nonneg check (avg_monthly_kwh is null or avg_monthly_kwh >= 0);
alter table public.powergenie_customers drop constraint if exists powergenie_customers_usage_history_array;
alter table public.powergenie_customers
  add constraint powergenie_customers_usage_history_array check (
    usage_history is null
    or (jsonb_typeof(usage_history) = 'array' and jsonb_array_length(usage_history) <= 36)
  );

alter table public.hub_appointments drop constraint if exists hub_appointments_esiid_digits;
alter table public.hub_appointments
  add constraint hub_appointments_esiid_digits check (esiid is null or esiid ~ '^[0-9]{17,22}$');
alter table public.hub_appointments drop constraint if exists hub_appointments_meter_len;
alter table public.hub_appointments
  add constraint hub_appointments_meter_len check (meter_number is null or char_length(meter_number) <= 40);
alter table public.hub_appointments drop constraint if exists hub_appointments_tdu_len;
alter table public.hub_appointments
  add constraint hub_appointments_tdu_len check (tdu is null or char_length(tdu) <= 80);
alter table public.hub_appointments drop constraint if exists hub_appointments_puct_len;
alter table public.hub_appointments
  add constraint hub_appointments_puct_len check (rep_puct_certificate is null or char_length(rep_puct_certificate) <= 12);
alter table public.hub_appointments drop constraint if exists hub_appointments_avg_monthly_nonneg;
alter table public.hub_appointments
  add constraint hub_appointments_avg_monthly_nonneg check (avg_monthly_kwh is null or avg_monthly_kwh >= 0);
alter table public.hub_appointments drop constraint if exists hub_appointments_usage_history_array;
alter table public.hub_appointments
  add constraint hub_appointments_usage_history_array check (
    usage_history is null
    or (jsonb_typeof(usage_history) = 'array' and jsonb_array_length(usage_history) <= 36)
  );

create index if not exists powergenie_customers_created_idx
  on public.powergenie_customers (created_at desc);

-- ---------------------------------------------------------------------------
-- Seen tracking. One row per member per lead. The other person still sees New.
-- ---------------------------------------------------------------------------

create table if not exists public.hub_lead_seen (
  user_id  uuid not null references public.hub_profiles (id) on delete cascade,
  source   text not null check (source in ('customer', 'booking')),
  lead_id  text not null check (char_length(lead_id) between 1 and 80),
  seen_at  timestamptz not null default now(),
  primary key (user_id, source, lead_id)
);
alter table public.hub_lead_seen enable row level security;

drop policy if exists "members read own lead seen" on public.hub_lead_seen;
create policy "members read own lead seen" on public.hub_lead_seen
  for select to authenticated
  using (public.is_hub_member() and user_id = (select auth.uid()));

drop policy if exists "members mark own lead seen" on public.hub_lead_seen;
create policy "members mark own lead seen" on public.hub_lead_seen
  for insert to authenticated
  with check (public.is_hub_member() and user_id = (select auth.uid()));

drop policy if exists "members update own lead seen" on public.hub_lead_seen;
create policy "members update own lead seen" on public.hub_lead_seen
  for update to authenticated
  using (public.is_hub_member() and user_id = (select auth.uid()))
  with check (public.is_hub_member() and user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Hub members can read website leads. No insert/update/delete policies:
-- the assistant writes with the service role.
-- ---------------------------------------------------------------------------

drop policy if exists "hub members read customers" on public.powergenie_customers;
create policy "hub members read customers" on public.powergenie_customers
  for select to authenticated using (public.is_hub_member());

drop policy if exists "hub members read customer files" on public.powergenie_files;
create policy "hub members read customer files" on public.powergenie_files
  for select to authenticated using (public.is_hub_member());

drop policy if exists "hub members read customer activity" on public.powergenie_activity;
create policy "hub members read customer activity" on public.powergenie_activity
  for select to authenticated using (public.is_hub_member());

-- Light bills the assistant stored in the private `powergenie` bucket.
-- Signed URLs from the dashboard need this SELECT policy. Uploads stay
-- on the service role, so there is no insert policy for authenticated.
drop policy if exists "hub members read powergenie bills" on storage.objects;
create policy "hub members read powergenie bills" on storage.objects
  for select to authenticated
  using (bucket_id = 'powergenie' and public.is_hub_member());

-- ---------------------------------------------------------------------------
-- Realtime. Full replica identity so updates include the row under RLS.
-- ---------------------------------------------------------------------------

alter table public.powergenie_customers replica identity full;
alter table public.powergenie_files replica identity full;
alter table public.powergenie_activity replica identity full;
alter table public.hub_appointments replica identity full;
alter table public.hub_appointment_files replica identity full;
alter table public.hub_lead_seen replica identity full;

do $$
declare
  target text;
begin
  foreach target in array[
    'powergenie_customers',
    'powergenie_files',
    'powergenie_activity',
    'hub_appointments',
    'hub_appointment_files',
    'hub_lead_seen'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Repeatable. anon and public get nothing on these tables.
-- ---------------------------------------------------------------------------

revoke all on table public.powergenie_customers, public.powergenie_files, public.powergenie_activity, public.hub_lead_seen
  from public, anon;

grant select, insert, update, delete on
  public.powergenie_customers, public.powergenie_files, public.powergenie_activity, public.hub_lead_seen
  to service_role;

grant select on public.powergenie_customers, public.powergenie_files, public.powergenie_activity
  to authenticated;
grant select, insert, update on public.hub_lead_seen to authenticated;
