-- Guests can choose to enter with the camera on or off.
-- Safe if the conference tables are already created.

alter table public.hub_conference_guests
  add column if not exists wants_camera boolean not null default true;

comment on column public.hub_conference_guests.wants_camera is
  'True when the guest asked to join with their camera on. They can still switch during the call.';
