# Owner dashboard + booking — design (2026-10-22)

## Why
Horace Lawrence (Sunrun rep, owner of the Power Genie site) needs one private place to talk with Rory, share documents/photos, and run his appointment calendar. Customers should be able to book a call with him from the site without ever double-booking him. His Android phone (Google Calendar) must stay in sync both ways.

## Goals
- Owner login (Horace) at /dashboard on thepowergenie.theroyeffect.com.
- Dashboard tabs: Chat, Files (documents + images), Schedule.
- Two-way sync with Horace's Google Calendar: dashboard bookings land on his phone; anything he adds on his phone blocks that time.
- Public booking page: customers see ONLY open 1-hour slots (no event details), and cannot book a slot starting less than 1 hour from now.
- No overlaps, ever (checked against Google Calendar at the moment of booking, plus a database constraint).

## Non-goals / anti-goals
- Do not change the landing page's Sunrun Salesforce form, Horace's card/link, or the srep=powergenie code.
- Customers never see other people's appointments or names.
- No public sign-up for dashboard accounts.

## Approaches
1. Supabase (auth, Postgres, realtime chat, storage) + Vercel serverless functions + Google Calendar API — CHOSEN by Rory: simplest fit with the existing Vite/React site on Vercel.
2. Firebase + Google Calendar — same features, less natural fit with Vercel, more custom rules work.

## How (decided)
- Backend: Supabase project; Vercel `/api/*` functions hold the Google OAuth refresh token and service-role key (never in the browser).
- Calendar: Horace connects his Google account once from the dashboard (OAuth). Free/busy comes from Google Calendar; bookings are written as Google Calendar events.
- Booking rules: 1-hour appointments, minimum 1-hour notice.

## My calls (Rory can change)
- Dashboard users: Horace (owner) and Rory (admin), invite-only, email + password login.
- Chat: one shared room between Horace and Rory, realtime, with image/file attachments.
- Files: private Supabase storage bucket, visible only to dashboard users.
- Booking form asks: name, phone, email, address, short note. Customer gets an on-screen confirmation; Horace gets the Google Calendar event with those details.
- Bookable window: weekdays 9 AM–8 PM Central (last slot starts 7 PM), up to 30 days ahead, slots on the hour.

## Open
- (none)

## Left to the builder
- UI styling consistent with the current site, table schema, RLS policies, error states, setup README for Supabase + Google Cloud OAuth keys.
