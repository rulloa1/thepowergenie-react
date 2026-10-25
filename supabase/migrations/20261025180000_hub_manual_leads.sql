-- Referral Hub members can add, edit, and archive customer leads.
--
-- Idempotent. Safe to run more than once.
-- Adds two nullable columns and policies only. It does not UPDATE, DELETE,
-- or rewrite existing powergenie_customers rows, files, or storage objects.
--
-- Apply this file on project ogwiopxnjpwwzleqwobq before the new Leads tab
-- buttons will save. Do not db push from the app deploy by itself.
--
-- The website assistant and the Gmail light-bill routine insert with the
-- service role, which bypasses these policies. Their created_by values
-- (null for the website, a powergenie user id for older rows) are unchanged.
-- Hub manual rows are the only ones whose created_by is manual:<auth user id>.
-- anon receives no new privileges.

-- ---------------------------------------------------------------------------
-- Archive columns. Null means the lead stays on the active list.
-- Text timestamps match created_at / updated_at on this table.
-- ---------------------------------------------------------------------------

alter table public.powergenie_customers
  add column if not exists archived_at text,
  add column if not exists archived_by text;

alter table public.powergenie_customers drop constraint if exists powergenie_customers_archived_pair;
alter table public.powergenie_customers
  add constraint powergenie_customers_archived_pair check (
    (archived_at is null and archived_by is null)
    or (
      archived_at is not null
      and archived_by is not null
      and char_length(archived_at) between 20 and 40
      and char_length(archived_by) between 1 and 80
    )
  );

create index if not exists powergenie_customers_active_created_idx
  on public.powergenie_customers (created_at desc)
  where archived_at is null;

comment on column public.powergenie_customers.archived_at is
  'ISO-8601 text. Null keeps the lead on the active Referral Hub list. Hub members set it to archive and clear it to restore. Website and Gmail inserts leave it null.';

-- ---------------------------------------------------------------------------
-- Writes for signed-in hub members (owner and admin). No DELETE policy:
-- archiving is an update. Service role keeps full access for the assistant
-- and the Gmail routine. anon stays revoked.
-- ---------------------------------------------------------------------------

revoke all on table public.powergenie_customers from public, anon;
grant select, insert, update, delete on table public.powergenie_customers to service_role;
grant select on table public.powergenie_customers to authenticated;

grant insert (
  id,
  created_at,
  logged_on,
  created_by,
  customer_name,
  service_address,
  utility,
  account_number,
  phone,
  email,
  esiid,
  meter_number,
  tdu,
  rep_puct_certificate,
  bill_date,
  rate_plan,
  kwh_this_period,
  days,
  avg_kwh_per_day,
  kwh_same_month_last_year,
  current_charges,
  total_due,
  past_due,
  est_cents_per_kwh,
  avg_monthly_kwh,
  usage_history,
  notes,
  stage,
  date_sent_to_horace,
  updated_at
) on table public.powergenie_customers to authenticated;

grant update (
  customer_name,
  service_address,
  utility,
  account_number,
  phone,
  email,
  esiid,
  meter_number,
  tdu,
  rep_puct_certificate,
  bill_date,
  rate_plan,
  kwh_this_period,
  days,
  avg_kwh_per_day,
  kwh_same_month_last_year,
  current_charges,
  total_due,
  past_due,
  est_cents_per_kwh,
  avg_monthly_kwh,
  usage_history,
  notes,
  stage,
  horace_notes,
  updated_at,
  archived_at,
  archived_by
) on table public.powergenie_customers to authenticated;

revoke delete on table public.powergenie_customers from authenticated, anon, public;

drop policy if exists "hub members insert customers" on public.powergenie_customers;
create policy "hub members insert customers" on public.powergenie_customers
  for insert to authenticated
  with check (
    (select public.is_hub_member())
    and created_by = 'manual:' || (select auth.uid())::text
    and archived_at is null
    and archived_by is null
  );

drop policy if exists "hub members update customers" on public.powergenie_customers;
create policy "hub members update customers" on public.powergenie_customers
  for update to authenticated
  using ((select public.is_hub_member()))
  with check ((select public.is_hub_member()));

-- Light-bill rows the dashboard attaches. Members cannot update or delete
-- an existing file row, so a Gmail or assistant bill cannot be retargeted.
revoke all on table public.powergenie_files from public, anon;
grant select, insert, update, delete on table public.powergenie_files to service_role;
grant select on table public.powergenie_files to authenticated;
grant insert (
  id,
  customer_id,
  uploaded_by,
  uploader_name,
  category,
  file_name,
  mime_type,
  size_bytes,
  storage_path,
  created_at
) on table public.powergenie_files to authenticated;
revoke update, delete on table public.powergenie_files from authenticated, anon, public;

drop policy if exists "hub members attach light bills" on public.powergenie_files;
create policy "hub members attach light bills" on public.powergenie_files
  for insert to authenticated
  with check (
    (select public.is_hub_member())
    and category = 'light_bill'
    and customer_id is not null
    and uploaded_by = (select auth.uid())::text
    and left(storage_path, char_length('customers/' || customer_id || '/light_bill/'))
        = 'customers/' || customer_id || '/light_bill/'
    and storage_path ~ '^customers/[A-Za-z0-9_-]{1,80}/light_bill/[A-Za-z0-9._-]{1,160}$'
  );

-- Activity notes from the dashboard. Other activity types stay on the service role.
revoke all on table public.powergenie_activity from public, anon;
grant select, insert, update, delete on table public.powergenie_activity to service_role;
grant select on table public.powergenie_activity to authenticated;
grant insert (
  id,
  customer_id,
  actor_id,
  actor_name,
  type,
  message,
  created_at
) on table public.powergenie_activity to authenticated;
revoke update, delete on table public.powergenie_activity from authenticated, anon, public;

drop policy if exists "hub members log customer activity" on public.powergenie_activity;
create policy "hub members log customer activity" on public.powergenie_activity
  for insert to authenticated
  with check (
    (select public.is_hub_member())
    and actor_id = (select auth.uid())::text
    and customer_id is not null
    and type in ('hub_lead_added', 'hub_lead_updated', 'hub_lead_archived', 'hub_lead_restored')
    and char_length(message) between 1 and 1000
  );

-- Private powergenie bucket: members may add a new light-bill object.
-- They already have SELECT. There is still no UPDATE or DELETE for this bucket,
-- so an upload cannot replace or remove a bill the assistant or Gmail stored.
drop policy if exists "hub members upload customer light bills" on storage.objects;
create policy "hub members upload customer light bills" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'powergenie'
    and (select public.is_hub_member())
    and name ~ '^customers/[A-Za-z0-9_-]{1,80}/light_bill/[A-Za-z0-9._-]{1,160}$'
  );
