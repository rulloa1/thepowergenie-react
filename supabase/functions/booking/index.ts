// Public booking endpoint for /book.
//
//   GET  → open 1-hour slots only (start/end times; never names or other appointments)
//   POST → multipart form: start, name, phone, email, address, note, bill (optional file)
//
// Every POST re-checks the slot rules, the database and Google free/busy before saving.
// The Postgres exclusion constraint is the final backstop against double booking.

import { billAmount, type NormalizedBill } from '../_shared/bill.ts';
import { adminClient, bookedIntervals, type Admin } from '../_shared/db.ts';
import { fail, json, notConfigured, preflight, serviceKey, env } from '../_shared/http.ts';
import { dashboardLeadUrl, sendLeadAlert, siteOrigin } from '../_shared/notify.ts';
import { readUploadedBill } from '../_shared/read-bill.ts';
import {
  createEvent,
  deleteEvent,
  freeBusy,
  GoogleError,
  googleConfigured,
  loadConnection,
  type Connection,
} from '../_shared/google.ts';
import { bookingWindow, DEFAULT_RULES, generateSlots, isBookableSlot, SLOT_TIME_ZONE } from '../_shared/slots.ts';

const MAX_BILL_BYTES = 10 * 1024 * 1024;
const BILL_BUCKET = 'hub-light-bills';
const REQUIRE_LIGHT_BILL = false; // flip to true to make the upload mandatory

// Abuse limits, enforced on the server before anything is saved or uploaded.
const MAX_BOOKINGS_PER_IP_PER_DAY = 3;
const MAX_PUBLIC_BOOKINGS_PER_DAY = 25; // site-wide backstop against slot flooding

/** Salted SHA-256 of the caller's IP — enough to rate limit without storing the IP itself. */
async function ipHash(req: Request) {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${serviceKey()}|${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns an error response if this request should be refused, otherwise null. */
async function abuseCheck(admin: Admin, ipKey: string, email: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [perIp, siteWide, existing] = await Promise.all([
    admin.from('hub_appointments').select('id', { count: 'exact', head: true })
      .eq('source', 'public').eq('client_ip_hash', ipKey).gte('created_at', since),
    admin.from('hub_appointments').select('id', { count: 'exact', head: true })
      .eq('source', 'public').gte('created_at', since),
    admin.from('hub_appointments').select('id', { count: 'exact', head: true })
      .eq('status', 'booked').eq('email', email).gt('starts_at', new Date().toISOString()),
  ]);
  if (perIp.error || siteWide.error || existing.error) throw perIp.error || siteWide.error || existing.error;
  if ((existing.count ?? 0) > 0) {
    return fail(409, 'already_booked', 'You already have an upcoming consultation. Call 510-241-7007 to change it.');
  }
  if ((perIp.count ?? 0) >= MAX_BOOKINGS_PER_IP_PER_DAY || (siteWide.count ?? 0) >= MAX_PUBLIC_BOOKINGS_PER_DAY) {
    return fail(429, 'rate_limited', 'Too many bookings right now. Please call 510-241-7007 and we will get you scheduled.');
  }
  return null;
}

/** All busy time in the booking window: booked appointments + Google busy. */
async function busyTime(admin: Admin, conn: Connection | null, now: Date) {
  const { timeMin, timeMax } = bookingWindow(now);
  const busy = await bookedIntervals(admin, timeMin, timeMax);
  if (conn && googleConfigured()) busy.push(...(await freeBusy(conn, timeMin, timeMax)));
  return busy;
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// --- Light bill file checks: extension, declared type AND file signature -------------

type BillKind = { ext: string; type: string };

function sniff(bytes: Uint8Array): BillKind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 5) === '%PDF-') return { ext: 'pdf', type: 'application/pdf' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return { ext: 'png', type: 'image/png' };
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { ext: 'heic', type: 'image/heic' };
    }
  }
  return null;
}

const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif']);

async function checkBill(file: File): Promise<{ kind: BillKind; bytes: Uint8Array } | string> {
  if (file.size === 0) return 'The light bill file is empty.';
  if (file.size > MAX_BILL_BYTES) return 'The light bill must be 10 MB or smaller.';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return 'Please upload the light bill as a PDF, JPG, PNG or HEIC file.';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return "We couldn't read that file. Please upload a PDF, JPG, PNG or HEIC.";
  return { kind, bytes };
}

// --- Handlers ------------------------------------------------------------------------

async function listSlots(admin: Admin) {
  const now = new Date();
  let conn: Connection | null = null;
  try {
    conn = googleConfigured() ? await loadConnection(admin) : null;
    const busy = await busyTime(admin, conn, now);
    return json({ timeZone: SLOT_TIME_ZONE, slotMinutes: DEFAULT_RULES.slotMinutes, slots: generateSlots(now, busy) });
  } catch (e) {
    console.error('[booking:list]', e);
    // Fail closed: if Google can't confirm Horace is free, don't offer times.
    return fail(503, 'calendar_unavailable', "Online booking is temporarily unavailable. Please call or try again shortly.");
  }
}

async function book(admin: Admin, req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'bad_request', 'Please submit the booking form again.');
  }

  // Honeypot: real people never fill this hidden field.
  if (clean(form.get('website'), 200)) return json({ ok: true });

  const start = clean(form.get('start'), 40);
  const name = clean(form.get('name'), 120);
  const phone = clean(form.get('phone'), 40);
  const email = clean(form.get('email'), 254).toLowerCase();
  const address = clean(form.get('address'), 300);
  const note = typeof form.get('note') === 'string' ? String(form.get('note')).trim().slice(0, 1000) : '';

  if (!name) return fail(400, 'invalid', 'Please enter your name.');
  if ((phone.match(/\d/g) || []).length < 10) return fail(400, 'invalid', 'Please enter a phone number with area code.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(400, 'invalid', 'Please enter a valid email address.');
  if (address.length < 5) return fail(400, 'invalid', 'Please enter the service address.');

  const startDate = new Date(start);
  if (!start || Number.isNaN(startDate.getTime())) return fail(400, 'invalid', 'Please choose a time.');

  const ipKey = await ipHash(req);
  try {
    const refused = await abuseCheck(admin, ipKey, email);
    if (refused) return refused;
  } catch (e) {
    console.error('[booking:abuse-check]', e);
    return fail(503, 'unavailable', "We couldn't take bookings right now. Please try again in a minute.");
  }

  let bill: { kind: BillKind; bytes: Uint8Array; name: string } | null = null;
  const file = form.get('bill');
  if (file instanceof File && file.size > 0) {
    const checked = await checkBill(file);
    if (typeof checked === 'string') return fail(400, 'invalid_file', checked);
    bill = { ...checked, name: file.name.slice(0, 200) };
  } else if (REQUIRE_LIGHT_BILL) {
    return fail(400, 'invalid_file', "Please upload last month's light bill.");
  }

  // Same extractor as the website assistant. A miss here still books the consult.
  let fields: NormalizedBill | null = null;
  if (bill) {
    try {
      fields = await readUploadedBill(admin, bill.bytes, bill.kind.type);
    } catch (e) {
      console.error('[booking:extract]', e instanceof Error ? e.name : 'unknown');
      fields = null;
    }
  }

  // Re-check the slot against the rules, the database (including website consults) and Google — right now.
  const now = new Date();
  let conn: Connection | null = null;
  try {
    conn = googleConfigured() ? await loadConnection(admin) : null;
    const busy = await busyTime(admin, conn, now);
    if (!isBookableSlot(startDate, now, busy)) {
      return fail(409, 'slot_unavailable', 'Sorry — that time was just taken or is no longer available. Please pick another.');
    }
  } catch (e) {
    console.error('[booking:recheck]', e);
    return fail(503, 'calendar_unavailable', "We couldn't confirm that time right now. Please try again in a minute.");
  }

  const endDate = new Date(startDate.getTime() + DEFAULT_RULES.slotMinutes * 60_000);

  // Upload first (server-side, service role) so a failed upload never leaves a half booking.
  let billPath: string | null = null;
  if (bill) {
    const month = startDate.toISOString().slice(0, 7);
    billPath = `${month}/${crypto.randomUUID()}.${bill.kind.ext}`;
    const { error } = await admin.storage
      .from(BILL_BUCKET)
      .upload(billPath, bill.bytes, { contentType: bill.kind.type, upsert: false });
    if (error) {
      console.error('[booking:upload]', error);
      return fail(500, 'upload_failed', "We couldn't upload your light bill. Please try again.");
    }
  }

  const { data: appt, error: insertError } = await admin
    .from('hub_appointments')
    .insert({
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      source: 'public',
      customer_name: name,
      phone,
      email,
      address,
      note: note || null,
      client_ip_hash: ipKey,
      kwh: fields?.kwhThisPeriod ?? null,
      bill_amount: billAmount(fields),
      esiid: fields?.esiid ?? null,
      meter_number: fields?.meterNumber ?? null,
      tdu: fields?.tdu ?? null,
      rep_puct_certificate: fields?.repPuctCertificate ?? null,
      avg_monthly_kwh: fields?.avgMonthlyKwh ?? null,
      usage_history: fields?.usageHistory ?? null,
    })
    .select('id')
    .single();

  if (insertError || !appt) {
    if (billPath) await admin.storage.from(BILL_BUCKET).remove([billPath]);
    if (insertError?.code === '23P01') {
      // Exclusion constraint: someone booked this exact time a moment ago.
      return fail(409, 'slot_unavailable', 'Sorry — that time was just taken. Please pick another.');
    }
    console.error('[booking:insert]', insertError);
    return fail(500, 'save_failed', "We couldn't save your booking. Please try again.");
  }

  if (bill && billPath) {
    const { error } = await admin.from('hub_appointment_files').insert({
      appointment_id: appt.id,
      kind: 'light_bill',
      bucket: BILL_BUCKET,
      storage_path: billPath,
      original_name: bill.name,
      content_type: bill.kind.type,
      size_bytes: bill.bytes.byteLength,
    });
    if (error) console.error('[booking:file-row]', error);
  }

  // Put it on Horace's phone. A Google hiccup must not lose the booking — it's saved and
  // flagged in the dashboard so it can be re-synced.
  if (conn) {
    try {
      const eventId = await createEvent(conn, {
        appointmentId: appt.id,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        customerName: name,
        phone,
        email,
        address,
        note,
        hasLightBill: !!bill,
        source: 'public',
      });
      const { error: linkError } = await admin.from('hub_appointments').update({ google_event_id: eventId }).eq('id', appt.id);
      if (linkError) {
        // Without the stored id a later "Sync now" would create a duplicate, so undo the event.
        await deleteEvent(conn, eventId).catch(() => {});
        throw new GoogleError(`could not save Google event id: ${linkError.message}`);
      }
    } catch (e) {
      console.error('[booking:google]', e);
      await admin
        .from('hub_appointments')
        .update({ google_sync_error: e instanceof GoogleError ? e.message : 'Google Calendar sync failed' })
        .eq('id', appt.id);
    }
  }

  await sendLeadAlert({
    id: appt.id,
    source: 'booking',
    name,
    address,
    kwh: fields?.kwhThisPeriod ?? null,
    amount: billAmount(fields),
    appointment: new Intl.DateTimeFormat('en-US', {
      timeZone: SLOT_TIME_ZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(startDate),
    billAttached: !!bill,
    dashboardUrl: dashboardLeadUrl(siteOrigin(env('SITE_URL')), appt.id),
  }, {
    resendApiKey: env('RESEND_API_KEY'),
    notifyFrom: env('NOTIFY_FROM'),
    notifyEmailTo: env('NOTIFY_EMAIL_TO'),
    twilioAccountSid: env('TWILIO_ACCOUNT_SID'),
    twilioAuthToken: env('TWILIO_AUTH_TOKEN'),
    twilioFrom: env('TWILIO_FROM'),
    notifySmsTo: env('NOTIFY_SMS_TO'),
  }, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12_000) }).then((response) => ({
    ok: response.ok,
    status: response.status,
  })));

  return json({ ok: true, start: startDate.toISOString(), end: endDate.toISOString(), timeZone: SLOT_TIME_ZONE });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const admin = adminClient();
  if (!admin) return notConfigured(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  try {
    if (req.method === 'GET') return await listSlots(admin);
    if (req.method === 'POST') return await book(admin, req);
    return fail(405, 'method_not_allowed', 'Method not allowed.');
  } catch (e) {
    console.error('[booking]', e);
    return fail(500, 'server_error', 'Something went wrong. Please try again.');
  }
});
