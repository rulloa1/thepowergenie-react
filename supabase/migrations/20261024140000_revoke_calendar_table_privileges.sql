-- Drop TRUNCATE, REFERENCES, and TRIGGER from authenticated on the calendar tables.
--
-- Idempotent. Safe to run more than once. It does not change rows, policies,
-- or the SELECT grant members use to read sync status.
--
-- hub_calendar_events grants SELECT to authenticated. Default table privileges
-- can also leave TRUNCATE, REFERENCES, and TRIGGER on that role, and REVOKE ALL
-- was only issued for public and anon. hub_google_accounts is service-role
-- only; the same three privileges are revoked there in case default privileges
-- still list them for authenticated.

revoke truncate, references, trigger on table public.hub_calendar_events from authenticated;
revoke truncate, references, trigger on table public.hub_google_accounts from authenticated;
