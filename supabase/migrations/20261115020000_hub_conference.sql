-- Conference rooms for the Referral Hub (LiveKit Cloud).
-- The Vercel server mints tokens with the LiveKit API secret.
-- The browser never reads these tables. Safe to run more than once.

create table if not exists public.hub_conference_rooms (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.powergenie_customers (id) on delete cascade,
  invite_token text not null unique,
  livekit_room text not null unique,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

create index if not exists hub_conference_rooms_customer
  on public.hub_conference_rooms (customer_id, created_at desc);

create table if not exists public.hub_conference_guests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hub_conference_rooms (id) on delete cascade,
  display_name text not null,
  status text not null default 'waiting' check (status in ('waiting', 'admitted', 'denied')),
  created_at timestamptz not null default now()
);

create index if not exists hub_conference_guests_room
  on public.hub_conference_guests (room_id, created_at);

alter table public.hub_conference_rooms enable row level security;
alter table public.hub_conference_guests enable row level security;

comment on table public.hub_conference_rooms is
  'Private LiveKit rooms tied to a customer. The invite token is unguessable and is not the LiveKit room name. No anon or member policies; the Vercel server uses the service role.';
