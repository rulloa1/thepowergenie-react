-- Leads from the standalone launch pages (Gas Genie, Celebrity Solar,
-- Hip Hop Solar, Sport & Solar). The public can insert only; nobody can read
-- through the API. Each insert calls the brand-lead-alert function, which
-- emails and texts the alert once and stamps alerted_at.

create table if not exists public.brand_leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  site text not null check (site in ('gas-genie','celebrity-solar','hip-hop-solar','sport-and-solar')),
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 200),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  choice text check (choice is null or char_length(choice) <= 80),
  consent boolean not null default false,
  page_url text check (page_url is null or char_length(page_url) <= 300)
);

alter table public.brand_leads enable row level security;
revoke all on public.brand_leads from anon, authenticated;
grant insert (site, name, phone, email, zip, choice, consent, page_url) on public.brand_leads to anon;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'brand_leads' and policyname = 'public can submit leads') then
    create policy "public can submit leads" on public.brand_leads for insert to anon with check (true);
  end if;
end $$;

create index if not exists brand_leads_site_created on public.brand_leads (site, created_at desc);

alter table public.brand_leads add column if not exists alerted_at timestamptz;

create or replace function public.brand_leads_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ogwiopxnjpwwzleqwobq.supabase.co/functions/v1/brand-lead-alert',
    body := jsonb_build_object('id', new.id),
    headers := '{"content-type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.brand_leads_notify() from public, anon, authenticated;

drop trigger if exists brand_leads_notify on public.brand_leads;
create trigger brand_leads_notify
  after insert on public.brand_leads
  for each row execute function public.brand_leads_notify();
