-- Per-member Google Calendar connections and one event id per member.
--
-- Idempotent and additive. It does not drop data, does not change the Sunrun
-- form, and does not rewrite existing appointment rows except to copy Horace's
-- already-stored event id into the new table when that row is still missing.
--
-- Apply this in the Supabase SQL editor (or `supabase db push`) before
-- connecting calendars. The edge functions keep working against
-- hub_google_credentials until this runs, then they use hub_google_accounts.
--
-- Availability stays on the owner (Horace). required_for_availability adds
-- another connected member's free/busy on top of his. There is no other
-- "required attendee" flag in the hub.

-- ---------------------------------------------------------------------------
-- One refresh token per hub member. Service role only.
-- ---------------------------------------------------------------------------

create table if not exists public.hub_google_accounts (
  user_id                    uuid primary key references public.hub_profiles (id) on delete cascade,
  google_email               text,
  calendar_id                text not null default 'primary',
  refresh_token              text not null,
  scope                      text,
  required_for_availability  boolean not null default false,
  connected_at               timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table public.hub_google_accounts enable row level security;
revoke all on table public.hub_google_accounts from public, anon, authenticated;
-- No policies on purpose: the refresh token is read only by Edge Functions
-- and the website assistant (service role).

grant select, insert, update, delete on public.hub_google_accounts to service_role;

-- Copy the original single connection (hub_google_credentials.id = 1) once.
insert into public.hub_google_accounts (
  user_id, google_email, calendar_id, refresh_token, scope, required_for_availability, connected_at
)
select
  c.connected_by,
  c.google_email,
  coalesce(c.calendar_id, 'primary'),
  c.refresh_token,
  c.scope,
  false,
  c.connected_at
from public.hub_google_credentials c
where c.connected_by is not null
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Event ids. One row per member per hub appointment or assistant lead.
-- Members can read sync status. They cannot read or write tokens.
-- ---------------------------------------------------------------------------

create table if not exists public.hub_calendar_events (
  id               uuid primary key default gen_random_uuid(),
  appointment_id   uuid references public.hub_appointments (id) on delete cascade,
  customer_id      text,
  user_id          uuid not null references public.hub_profiles (id) on delete cascade,
  google_event_id  text,
  sync_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.hub_calendar_events drop constraint if exists hub_calendar_events_one_target;
alter table public.hub_calendar_events
  add constraint hub_calendar_events_one_target check (
    (appointment_id is not null and customer_id is null)
    or (appointment_id is null and customer_id is not null)
  );

create unique index if not exists hub_calendar_events_appt_user_uidx
  on public.hub_calendar_events (appointment_id, user_id)
  where appointment_id is not null;

create unique index if not exists hub_calendar_events_customer_user_uidx
  on public.hub_calendar_events (customer_id, user_id)
  where customer_id is not null;

create index if not exists hub_calendar_events_appointment_idx
  on public.hub_calendar_events (appointment_id);

create index if not exists hub_calendar_events_customer_idx
  on public.hub_calendar_events (customer_id);

alter table public.hub_calendar_events enable row level security;
revoke all on table public.hub_calendar_events from public, anon;

drop policy if exists "members read calendar events" on public.hub_calendar_events;
create policy "members read calendar events" on public.hub_calendar_events
  for select to authenticated
  using (public.is_hub_member());

grant select, insert, update, delete on public.hub_calendar_events to service_role;
grant select on public.hub_calendar_events to authenticated;

-- Keep the legacy column in sync for appointments that already have one event.
insert into public.hub_calendar_events (appointment_id, user_id, google_event_id)
select a.id, c.connected_by, a.google_event_id
from public.hub_appointments a
join public.hub_google_credentials c on c.id = 1
where a.google_event_id is not null
  and c.connected_by is not null
on conflict (appointment_id, user_id) where appointment_id is not null do nothing;
