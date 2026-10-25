-- Smart Meter Texas consent and usage.
-- Safe to run more than once, after the Referral Hub scripts.
-- The browser cannot insert these rows. The booking function writes them.

create table if not exists public.smt_authorizations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.hub_appointments (id) on delete cascade,
  esi_id text not null,
  meter_number text not null,
  customer_email text not null,
  consent_at timestamptz not null,
  consent_text text not null,
  status text not null check (status in ('pending_setup', 'requested', 'approved', 'expired', 'failed')),
  smt_agreement_number text,
  smt_trans_id text,
  sync_note text,
  last_error text,
  interval_cursor date,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.smt_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.smt_authorizations (id) on delete cascade,
  esi_id text not null,
  period_start date not null,
  period_end date not null,
  kwh numeric not null,
  unique (authorization_id, period_start, period_end)
);

create table if not exists public.smt_usage_intervals (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.smt_authorizations (id) on delete cascade,
  esi_id text not null,
  interval_start timestamptz not null,
  kwh numeric not null,
  quality text,
  unique (authorization_id, interval_start)
);

create index if not exists smt_authorizations_status_idx
  on public.smt_authorizations (status, last_checked_at);

alter table public.smt_authorizations enable row level security;
alter table public.smt_usage_monthly enable row level security;
alter table public.smt_usage_intervals enable row level security;

drop policy if exists smt_authorizations_select_dashboard on public.smt_authorizations;
create policy smt_authorizations_select_dashboard
  on public.smt_authorizations
  for select
  to authenticated
  using (public.is_hub_member());

drop policy if exists smt_usage_monthly_select_dashboard on public.smt_usage_monthly;
create policy smt_usage_monthly_select_dashboard
  on public.smt_usage_monthly
  for select
  to authenticated
  using (public.is_hub_member());

drop policy if exists smt_usage_intervals_select_dashboard on public.smt_usage_intervals;
create policy smt_usage_intervals_select_dashboard
  on public.smt_usage_intervals
  for select
  to authenticated
  using (public.is_hub_member());

revoke all on table public.smt_authorizations from public, anon, authenticated;
revoke all on table public.smt_usage_monthly from public, anon, authenticated;
revoke all on table public.smt_usage_intervals from public, anon, authenticated;

grant select on table public.smt_authorizations to authenticated;
grant select on table public.smt_usage_monthly to authenticated;
grant select on table public.smt_usage_intervals to authenticated;

comment on table public.smt_authorizations is
  'Customer consent to share Smart Meter Texas usage for one appointment. Customers cannot read this table.';
comment on table public.smt_usage_monthly is
  'Monthly kWh from Smart Meter Texas. Dashboard users can read it. The public site cannot.';
comment on table public.smt_usage_intervals is
  '15-minute kWh from Smart Meter Texas. Dashboard users can read it. The public site cannot.';
