alter table public.hub_appointments
  add column if not exists owner_email_status text check (owner_email_status in ('accepted','failed','unconfigured')),
  add column if not exists referral_rep text,
  add column if not exists referral_state text;
