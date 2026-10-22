# Referral Hub setup — The Power Genie by Sunrun

Two new pages live alongside the scroll site:

| Page | Who | What |
|---|---|---|
| `/book` | Customers | Pick an open 1-hour slot, enter details, upload last month's light bill |
| `/dashboard` | Horace (owner) and Rory (admin), invite-only | Chat · Files · Schedule (with Google Calendar sync) |

Everything runs on the Supabase project **power-genie-portals** (`ogwiopxnjpwwzleqwobq`).
Secret keys (service role, Google client secret, Google refresh token) only ever live in Supabase
Edge Functions and the database — never in the browser or in Vercel.

Until the keys below are set, both pages show a friendly "isn't configured yet" message.

---

## 1. Database

Apply `supabase/migrations/20261022000000_referral_hub.sql` — either:

- **CLI:** `supabase link --project-ref ogwiopxnjpwwzleqwobq` then `supabase db push`, or
- **Dashboard:** SQL Editor → paste the file → Run.

It creates the `hub_*` tables, row-level security, the private storage buckets
(`hub-files`, `hub-chat`, `hub-light-bills`), realtime for chat, and the exclusion constraint
that makes overlapping appointments impossible.

## 2. Auth (invite-only)

Supabase dashboard → **Authentication**:

1. **Sign In / Providers → Email**: turn **off** "Allow new users to sign up". Keep Email enabled.
2. **URL Configuration**:
   - Site URL: your live site, e.g. `https://thepowergenie-react.vercel.app`
   - Redirect URLs: add `https://<your-site>/dashboard` (and `http://localhost:3000/dashboard` for local dev).

## 3. Invite users

Only emails in `public.hub_allowlist` get dashboard access. The migration seeds:

| Email | Role |
|---|---|
| `horace.lawrence@sunrun.com` | owner |
| `roryulloa@gmail.com` | admin |

If Horace will sign in with a different email, change it **before** inviting him:

```sql
update public.hub_allowlist set email = 'his.email@example.com' where role = 'owner';
```

Then **Authentication → Users → Invite user** for each email. They click the link in the email,
land on `/dashboard`, and choose a password. After that they sign in with email + password.
Forgotten passwords: "Forgot password?" on the sign-in screen.

To add someone later: insert them into `hub_allowlist` (role `owner` or `admin`), then invite them.

## 4. Google Calendar (Horace's Android phone)

### 4a. Google Cloud OAuth client

1. <https://console.cloud.google.com> → create (or pick) a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **Google Auth Platform → Branding / Audience** (OAuth consent screen):
   - User type **External**, app name "The Power Genie", support email.
   - **Data access / Scopes**: add `.../auth/calendar.events` and `.../auth/calendar.freebusy`.
   - **Audience → Publish app** ("In production"). In *Testing* mode Google expires the
     connection after 7 days. Unverified is fine for a single user — Horace will see
     "Google hasn't verified this app" → **Advanced → Go to The Power Genie**.
4. **Clients → Create client** → *Web application*:
   - **Authorized redirect URI** (exactly):
     `https://ogwiopxnjpwwzleqwobq.supabase.co/functions/v1/google-oauth`
5. Copy the **Client ID** and **Client secret**.

### 4b. Edge Function secrets

```bash
supabase secrets set --project-ref ogwiopxnjpwwzleqwobq \
  GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com \
  GOOGLE_CLIENT_SECRET=xxxxxxxx \
  SITE_URL=https://<your-site>
```

(or Supabase dashboard → Edge Functions → Secrets). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

### 4c. Deploy the functions

```bash
supabase functions deploy booking schedule google-oauth --project-ref ogwiopxnjpwwzleqwobq
```

`supabase/config.toml` turns off the gateway JWT check for these three — they check the
caller themselves (`schedule` and the Connect button require a signed-in member; `booking` is
public on purpose and only ever returns open start times).

### 4d. Connect

Horace signs in at `/dashboard` (works on his phone) → **Schedule → Connect Google Calendar** →
approves every checkbox. Done: bookings appear on his phone, and anything he adds on his phone
blocks those times on `/book`.

## 5. Vercel (frontend)

Project **thepowergenie-react** → Settings → Environment Variables (Production + Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://ogwiopxnjpwwzleqwobq.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key |

Redeploy. `vercel.json` rewrites `/book` and `/dashboard` to the app.

Local dev: copy `.env.example` → `.env.local`, fill in the two `VITE_` values, `npm run dev`.

---

## How the booking rules work

- Slots: weekdays, on the hour, 9 AM–7 PM start (last one ends 8 PM), Central time, up to
  30 days ahead, hidden if they start less than 1 hour from now.
  Logic: `supabase/functions/_shared/slots.ts` · tests: `npm test`.
- Listing slots subtracts booked appointments **and** Google free/busy.
- Booking re-checks the rules, the database and Google free/busy on the server, then inserts.
  If two people race for the same slot, the Postgres exclusion constraint
  `hub_appointments_no_overlap` rejects the second one.
- If Google is connected but can't be reached, `/book` stops offering times (fail closed) rather
  than risk a clash with something on Horace's phone.
- Light bills (PDF/JPG/PNG/HEIC ≤ 10 MB, checked by file signature) are uploaded by the server
  into the private `hub-light-bills` bucket. Customers can't list or read any files. In the
  dashboard they open through 60-second signed links. The Google event only says the bill is in
  the dashboard — no file link.
- Owner (Horace) can add and cancel appointments; both sync to Google. Admin (Rory) sees
  everything read-only on the Schedule tab and has full Chat and Files access.
- To make the light bill required, set `REQUIRE_LIGHT_BILL = true` in
  `supabase/functions/booking/index.ts`.
