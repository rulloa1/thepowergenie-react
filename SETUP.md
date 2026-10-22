# Set up the owner dashboard and booking page

This site already deploys to [https://thepowergenie.theroyeffect.com/](https://thepowergenie.theroyeffect.com/) when `main` is updated. The new pages are:

- [https://thepowergenie.theroyeffect.com/dashboard](https://thepowergenie.theroyeffect.com/dashboard) for Horace and Rory
- [https://thepowergenie.theroyeffect.com/book](https://thepowergenie.theroyeffect.com/book) for customers

Until the steps below are done, those pages show a short “not configured yet” message. The public solar site keeps working.

Horace’s login email in this guide is `horace.lawrence@sunrun.com`. That address is a placeholder. If he will sign in with a different email, use that email everywhere this guide says his address.

## Keys you will create

Add every one of these in Vercel. The first two are also safe to put in a local `.env.local` file. The rest are passwords. Do not put them in the website code, and do not give them a name that starts with `VITE_`.

| Name | Where it comes from | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | No. It is public. |
| `VITE_SUPABASE_ANON_KEY` | Same page → `anon` `public` key | No. It is the public browser key. |
| `SUPABASE_URL` | The same Project URL as above | No, but keep it with the server keys. |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → `service_role` key | Yes. This key skips the locks. |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credentials | No. |
| `GOOGLE_CLIENT_SECRET` | Same credential | Yes. |
| `GOOGLE_REDIRECT_URI` | You type this exact value: `https://thepowergenie.theroyeffect.com/api/google/callback` | No. |
| `PUBLIC_SITE_URL` | You type this exact value: `https://thepowergenie.theroyeffect.com` | No. |

`VITE_SUPABASE_URL` and `SUPABASE_URL` are the same Project URL, pasted twice. The website build reads the `VITE_` copy. The booking server reads the other copy.

## 1. Create the Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New project**. Name it `power-genie`. Choose a region close to Houston, such as East US. Save the database password somewhere safe (a password manager). You will not paste that database password into Vercel.
3. Wait until the project status is healthy.
4. Open **Project Settings** (the gear) → **API**.
5. Copy the **Project URL**. That is both `VITE_SUPABASE_URL` and `SUPABASE_URL`.
6. Copy the **anon public** key. That is `VITE_SUPABASE_ANON_KEY`.
7. Copy the **service_role** key. That is `SUPABASE_SERVICE_ROLE_KEY`. Treat it like a password.

## 2. Run the database script

1. In the repo, open `supabase/migrations/20261022120000_owner_dashboard.sql`.
2. Select all of the text and copy it.
3. In Supabase, open **SQL Editor** → **New query**.
4. Paste the script and click **Run**.
5. You should see **Success**. Running it a second time is safe.

This creates the tables for profiles, chat, files, and appointments. Confirmed appointments cannot overlap. It also creates a private file bucket named `dashboard-files` and turns on live chat updates.

Check **Storage** in the left sidebar. `dashboard-files` should say **Private**, not Public.

The Google refresh token is stored in `google_calendar_connections`. The browser is not allowed to read that table. Only the server functions can.

### Light bills

Customers can attach last month's electric bill while they book. That file lives in a second private bucket. Run this script too, even if you already ran the one above.

1. Open `supabase/migrations/20261022140000_light_bills.sql`.
2. In **SQL Editor** → **New query**, paste the whole script and click **Run**.
3. You should see **Success**. Running it again is safe.
4. Open **Storage**. A bucket named `light-bills` should say **Private**, not Public.
5. Do not add a Storage policy on `light-bills`, and do not turn the bucket public. Customers upload through the booking page only. They cannot see anyone else's file. Horace and Rory open a bill from that appointment on the **Schedule** tab. The link lasts about two minutes.

If the Schedule tab later says it could not load appointments, wait a minute and refresh so Supabase notices the new columns.

## 3. Turn off public sign-up

People should not be able to create their own dashboard login.

1. Open **Authentication** → **Sign In / Providers** (some projects call this **Providers**).
2. Leave **Email** turned on.
3. Turn **off** “Allow new users to sign up”. On some projects that switch is under **Authentication** → **Settings** → **User Signups** instead. Turn it off there.

## 4. Create the two logins

1. Open **Authentication** → **Users** → **Add user** → **Create new user**.
2. Rory: email `roryulloa@gmail.com`. Choose a password and store it in a password manager. Turn on **Auto Confirm User**. Create the user.
3. Horace: email `horace.lawrence@sunrun.com`, or the email he will actually use. Choose a password. Turn on **Auto Confirm User**. Create the user.

If a password is forgotten later, open that user in this same Users list and set a new password. You do not need email delivery turned on for that.

## 5. Mark the owner and the admin

A login cannot open the dashboard until it has a role. In **SQL Editor**, run this. If Horace’s email is not the Sunrun address, change only that email in the second statement before you run it.

```sql
insert into public.profiles (id, email, role, display_name)
select id, email, 'admin', 'Rory'
from auth.users
where email = 'roryulloa@gmail.com'
on conflict (id) do update
  set role = excluded.role,
      email = excluded.email,
      display_name = excluded.display_name;

insert into public.profiles (id, email, role, display_name)
select id, email, 'owner', 'Horace Lawrence'
from auth.users
where email = 'horace.lawrence@sunrun.com'
on conflict (id) do update
  set role = excluded.role,
      email = excluded.email,
      display_name = excluded.display_name;
```

Each statement should say it inserted or updated **1** row. If it says **0** rows, the email does not match the user you created. Check the spelling in **Authentication** → **Users**, fix the statement, and run it again.

Rory is the admin. Horace is the owner. Both can use chat, files, and the schedule. There is no sign-up form on the site.

## 6. Create the Google Calendar connection

Horace’s phone calendar is a normal Google calendar. The site asks Google for permission once, then keeps a refresh token on the server.

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account that should own this connection (Horace’s Gmail, or whoever manages it).
2. Create a project. Name it `Power Genie`.
3. Open the menu → **APIs & Services** → **Library**. Search for **Google Calendar API**. Open it and click **Enable**.
4. Open **APIs & Services** → **OAuth consent screen**.
   - User type: **External**. Create it.
   - App name: `The Power Genie`.
   - User support email: your email.
   - Developer contact: your email.
   - Save and continue.
5. On **Data access** / **Scopes**, click **Add or remove scopes**. Add:
   - `https://www.googleapis.com/auth/calendar` (Google Calendar)
   - `https://www.googleapis.com/auth/userinfo.email` (email address)
   - `openid`
   Save.
6. On **Test users**, add the Google account Horace uses on his phone. Save.
7. Open **Audience** (or the publishing control on the consent screen) and click **Publish app**. Confirm. Google may say the app is unverified. That is expected for a private tool used by one person. Leave it published so the connection does not expire after 7 days. If you leave the app in testing, Horace will have to click **Connect Google Calendar** again every week.
8. Open **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Power Genie web`.
   - Authorized JavaScript origins: `https://thepowergenie.theroyeffect.com`
   - Authorized redirect URIs: `https://thepowergenie.theroyeffect.com/api/google/callback`
   - Create.
9. Copy the **Client ID** into `GOOGLE_CLIENT_ID` and the **Client secret** into `GOOGLE_CLIENT_SECRET`.

The redirect URI has to match character for character, including `https://`.

## 7. Add the keys in Vercel

1. Open the Vercel project for this site.
2. Go to **Settings** → **Environment Variables**.
3. Add each name from the table at the top. Choose the **Production** environment. Paste the value. Save.
4. For `GOOGLE_REDIRECT_URI` paste:

   `https://thepowergenie.theroyeffect.com/api/google/callback`

5. For `PUBLIC_SITE_URL` paste:

   `https://thepowergenie.theroyeffect.com`

6. Open **Deployments**, open the menu on the latest deployment, and click **Redeploy**. The `VITE_` keys are copied into the site only when it is built, so a redeploy is required after you add them.

## 8. Connect Horace’s calendar

1. Open [https://thepowergenie.theroyeffect.com/dashboard](https://thepowergenie.theroyeffect.com/dashboard).
2. Sign in as Horace or Rory.
3. Open the **Schedule** tab.
4. Click **Connect Google Calendar**.
5. Sign in as the Google account on Horace’s phone. If Google says the app is not verified, click **Advanced**, then continue to The Power Genie. Allow calendar access.
6. You should land back on the dashboard with “Google Calendar is connected.”

Book a test call from [https://thepowergenie.theroyeffect.com/book](https://thepowergenie.theroyeffect.com/book). The open times are weekdays, on the hour, from 9 AM to 7 PM Central, up to 30 days ahead, and nothing that starts in less than an hour. The form asks for last month's light bill. That upload is optional. PDF, JPG, PNG, HEIC, and common phone photos are accepted, up to 10 MB. After you book, the call should appear on Horace’s phone and on the Schedule tab. If you attached a bill, the phone event says the file is on the dashboard. It does not include a link to the file itself. Open the appointment on the Schedule tab and use **View light bill**. A test event he creates on the phone should disappear from the open times within a refresh.

Do this connection before you send customers to `/book`. Until Google is connected, the site can still save a booking, but Horace’s phone events will not block that time, and the event will not be pushed to his phone.

## If Horace’s email changes

1. In Supabase, **Authentication** → **Users** → **Add user**, with **Auto Confirm** on.
2. Run the owner `insert` from step 5 again, with the new email.
3. He signs in at `/dashboard` with that email. The old login can stay or be deleted in the Users list. Deleting the auth user removes his profile. It does not delete appointments.

## If a developer runs this on a laptop

Install dependencies with Bun (`bun install`) and run `bun run dev`. The landing page works with no keys.

`/dashboard` and `/book` show the not-configured message until `.env.local` has the `VITE_` keys and the Vercel dev server (or a deployed site) has the server keys. Vite by itself does not run the `/api` functions.

While `bun run dev` is running, these local addresses show the screens without a login:

- `http://localhost:3000/dashboard?preview=login-screen`
- `http://localhost:3000/dashboard?preview=dashboard-tabs`
- `http://localhost:3000/dashboard?preview=dashboard-tabs&tab=schedule`
- `http://localhost:3000/book?preview=open-slots`

Those preview addresses do nothing on the deployed site.
