-- Light bills uploaded from the public booking page.
-- Safe to run more than once, after 20261022120000_owner_dashboard.sql.
-- Customers never get a policy on this bucket. The server uploads and signs downloads.

alter table public.appointments
  add column if not exists light_bill_path text,
  add column if not exists light_bill_name text,
  add column if not exists light_bill_mime text,
  add column if not exists light_bill_size bigint,
  add column if not exists light_bill_uploaded_at timestamptz,
  add column if not exists light_bill_upload_token text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_light_bill_size_ok'
  ) then
    alter table public.appointments
      add constraint appointments_light_bill_size_ok
      check (
        light_bill_size is null
        or (light_bill_size > 0 and light_bill_size <= 10485760)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_light_bill_uploaded_has_path'
  ) then
    alter table public.appointments
      add constraint appointments_light_bill_uploaded_has_path
      check (light_bill_uploaded_at is null or light_bill_path is not null);
  end if;
end $$;

create unique index if not exists appointments_light_bill_token_idx
  on public.appointments (light_bill_upload_token)
  where light_bill_upload_token is not null;

create unique index if not exists appointments_light_bill_path_idx
  on public.appointments (light_bill_path)
  where light_bill_path is not null;

comment on column public.appointments.light_bill_path is
  'Object path inside the private light-bills bucket. Dashboard browsers are not granted this column.';
comment on column public.appointments.light_bill_upload_token is
  'One-time secret that links an upload to this appointment. Cleared once the file is saved. Not granted to the browser.';

-- The first script granted select on every column. Take that back and list the columns
-- the dashboard page is allowed to read. The storage path and upload token stay on the server.
revoke select on table public.appointments from public, anon, authenticated;
grant select (
  id,
  starts_at,
  ends_at,
  status,
  customer_name,
  customer_phone,
  customer_email,
  customer_address,
  note,
  google_event_id,
  calendar_sync_error,
  created_by,
  source,
  created_at,
  light_bill_name,
  light_bill_size,
  light_bill_uploaded_at
) on table public.appointments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('light-bills', 'light-bills', false, 10485760)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

-- No select, insert, update, or delete policy is created for anon or authenticated.
-- A signed upload URL is issued by the server for one object. A signed download URL
-- is issued later to an owner or admin for that same object.

comment on column public.appointments.light_bill_name is
  'File name of the customer light bill, shown on the Schedule tab after upload.';
