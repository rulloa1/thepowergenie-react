create table public.hub_referral_qualifications (
  appointment_id uuid primary key references public.hub_appointments(id),
  home_key text not null unique,
  rep text not null,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  rep_credit_cents integer not null default 50000,
  site_credit_cents integer not null default 50000
);
alter table public.hub_referral_qualifications enable row level security;
revoke all on public.hub_referral_qualifications from public, anon, authenticated;
grant select on public.hub_referral_qualifications to authenticated;
create policy owner_reads on public.hub_referral_qualifications for select to authenticated using (public.is_hub_owner());

create function public.confirm_referral_home(booking_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.hub_appointments%rowtype;
begin
  if not public.is_hub_owner() then raise exception 'Owner access required'; end if;
  select * into strict a from public.hub_appointments where id = booking_id and status = 'booked' for share;
  if nullif(trim(a.referral_rep),'') is null or nullif(trim(a.address),'') is null then
    raise exception 'A referral rep and service address are required';
  end if;
  insert into public.hub_referral_qualifications(appointment_id,home_key,rep,confirmed_by)
    values(a.id,regexp_replace(lower(trim(a.address)), '[[:space:],.]+',' ','g'),trim(a.referral_rep),auth.uid())
    on conflict (appointment_id) do nothing;
end;
$$;
revoke all on function public.confirm_referral_home(uuid) from public, anon;
grant execute on function public.confirm_referral_home(uuid) to authenticated;
