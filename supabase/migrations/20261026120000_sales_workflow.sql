-- Sales workflow: pricing defaults, per-lead savings and roof design,
-- proposals Horace approves, tasks, and customer follow-ups.
-- Safe to run more than once. The website server (service role) writes
-- every table; the dashboard reaches them through that server.

create table if not exists public.hub_settings (
  id int primary key default 1 check (id = 1),
  pricing jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.hub_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.hub_lead_workflow (
  lead_id text primary key references public.powergenie_customers (id) on delete cascade,
  last_stage text,
  overrides jsonb not null default '{}'::jsonb,
  usage jsonb,
  system jsonb,
  savings jsonb,
  design jsonb,
  design_status text not null default 'pending'
    check (design_status in ('pending', 'ok', 'no_key', 'not_found', 'no_address', 'error')),
  design_note text,
  design_fetched_at timestamptz,
  contact_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  opted_out_at timestamptz,
  lead_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.powergenie_customers (id) on delete cascade,
  status text not null check (status in ('draft', 'approved', 'sent', 'superseded')),
  snapshot jsonb not null,
  public_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  approved_by_name text,
  sent_at timestamptz,
  sent_channels text[] not null default '{}',
  viewed_at timestamptz,
  view_count int not null default 0,
  interested_at timestamptz
);
create index if not exists hub_proposals_lead_idx on public.hub_proposals (lead_id, created_at desc);
-- At most one open draft per lead, so two runs cannot both create one.
create unique index if not exists hub_proposals_one_draft on public.hub_proposals (lead_id) where status = 'draft';

create table if not exists public.hub_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.powergenie_customers (id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  due_at timestamptz not null,
  done_at timestamptz,
  done_by uuid,
  done_by_name text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, kind)
);
create index if not exists hub_tasks_open_idx on public.hub_tasks (due_at) where done_at is null and cancelled_at is null;

create table if not exists public.hub_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.powergenie_customers (id) on delete cascade,
  key text not null,
  stage text not null,
  channel text not null check (channel in ('email', 'sms')),
  send_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'skipped', 'failed', 'cancelled')),
  subject text,
  body text not null,
  sent_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (lead_id, key, channel)
);
create index if not exists hub_followups_due_idx on public.hub_followups (send_at) where status = 'scheduled';

alter table public.hub_settings enable row level security;
alter table public.hub_lead_workflow enable row level security;
alter table public.hub_proposals enable row level security;
alter table public.hub_tasks enable row level security;
alter table public.hub_followups enable row level security;

-- No policies: the browser reads and writes these through the website
-- server, which checks the dashboard sign-in first. Tokens never leave it.
revoke all on table public.hub_settings, public.hub_lead_workflow, public.hub_proposals, public.hub_tasks, public.hub_followups
  from public, anon, authenticated;
-- This project does not grant new tables to the service role by default.
grant select, insert, update, delete on table public.hub_settings, public.hub_lead_workflow, public.hub_proposals, public.hub_tasks, public.hub_followups
  to service_role;
grant select, insert, update, delete on table public.smt_authorizations, public.smt_usage_monthly, public.smt_usage_intervals
  to service_role;

comment on table public.hub_proposals is
  'Proposal snapshots. Drafts wait for Horace; only approved or sent ones are visible at /proposal/{public_token}.';
comment on table public.hub_followups is
  'Customer emails and texts the workflow schedules. Sent by the website server every 15 minutes.';
