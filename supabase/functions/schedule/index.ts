// Dashboard schedule endpoint (signed-in Referral Hub members only).
//
//   POST { action: 'status' }                          → Google connection + busy blocks (30 days)
//   POST { action: 'create', start, durationMinutes, name, phone?, email?, address?, note? }  (owner)
//   POST { action: 'cancel', id }                       (owner)
//   POST { action: 'resync', id }                       (owner) retry a failed Google sync
//   POST { action: 'disconnect' }                       (owner) forget the Google connection

import { adminClient, bookedIntervals, hubUser, type Admin, type HubUser } from '../_shared/db.ts';
import { fail, json, notConfigured, preflight } from '../_shared/http.ts';
import {
  createEvent,
  deleteEvent,
  freeBusy,
  GoogleError,
  googleConfigured,
  loadConnection,
  revokeToken,
} from '../_shared/google.ts';
import { bookingWindow, SLOT_TIME_ZONE } from '../_shared/slots.ts';

const MINUTE = 60_000;

async function status(admin: Admin) {
  const configured = googleConfigured();
  const conn = configured ? await loadConnection(admin) : null;
  const google = {
    configured,
    connected: !!conn,
    email: conn?.email ?? null,
    connectedAt: conn?.connectedAt ?? null,
    error: null as string | null,
    needsReconnect: false,
  };
  let busy: { start: string; end: string }[] = [];
  if (conn) {
    const { timeMin, timeMax } = bookingWindow(new Date());
    try {
      busy = await freeBusy(conn, timeMin, timeMax);
    } catch (e) {
      console.error('[schedule:status]', e);
      google.error = 'Could not reach Google Calendar.';
      google.needsReconnect = e instanceof GoogleError && e.reconnect;
    }
  }
  return json({ timeZone: SLOT_TIME_ZONE, google, busy });
}

async function create(admin: Admin, user: HubUser, body: Record<string, unknown>) {
  const str = (k: string, max: number) => (typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '');
  const name = str('name', 120);
  const start = new Date(str('start', 40));
  const duration = Number(body.durationMinutes ?? 60);
  if (!name) return fail(400, 'invalid', 'Customer name is required.');
  if (Number.isNaN(start.getTime())) return fail(400, 'invalid', 'Pick a valid start time.');
  if (start.getTime() % (15 * MINUTE) !== 0) return fail(400, 'invalid', 'Start times must be on a 15-minute mark.');
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) return fail(400, 'invalid', 'Duration must be 15–480 minutes.');
  if (start.getTime() < Date.now() - 5 * MINUTE) return fail(400, 'invalid', 'That time is in the past.');
  const end = new Date(start.getTime() + duration * MINUTE);

  // Same checks as the public page: database + Google busy time.
  const clash = await bookedIntervals(admin, start.toISOString(), end.toISOString());
  if (clash.length) return fail(409, 'slot_unavailable', 'That time overlaps another appointment.');

  const conn = googleConfigured() ? await loadConnection(admin) : null;
  if (conn && body.ignoreGoogleBusy !== true) {
    try {
      const busy = await freeBusy(conn, start.toISOString(), end.toISOString());
      if (busy.length) {
        return fail(409, 'google_busy', 'Your Google Calendar shows you are busy then. Add it anyway?');
      }
    } catch (e) {
      console.error('[schedule:create:freebusy]', e);
      return fail(503, 'calendar_unavailable', 'Could not check Google Calendar. Try again, or reconnect it.');
    }
  }

  const { data: appt, error } = await admin
    .from('hub_appointments')
    .insert({
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      source: 'dashboard',
      customer_name: name,
      phone: str('phone', 40) || null,
      email: str('email', 254).toLowerCase() || null,
      address: str('address', 300) || null,
      note: str('note', 1000) || null,
      created_by: user.id,
    })
    .select('*')
    .single();
  if (error || !appt) {
    if (error?.code === '23P01') return fail(409, 'slot_unavailable', 'That time overlaps another appointment.');
    console.error('[schedule:create]', error);
    return fail(500, 'save_failed', 'Could not save the appointment.');
  }

  if (conn) await syncToGoogle(admin, appt.id);
  return json({ ok: true, id: appt.id });
}

async function syncToGoogle(admin: Admin, id: string) {
  const conn = await loadConnection(admin);
  if (!conn) return 'Google Calendar is not connected.';
  const { data: a } = await admin.from('hub_appointments').select('*').eq('id', id).single();
  if (!a || a.status !== 'booked') return 'Appointment not found.';
  if (a.google_event_id) return null;
  const { count } = await admin
    .from('hub_appointment_files')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', id);
  try {
    const eventId = await createEvent(conn, {
      appointmentId: a.id,
      start: a.starts_at,
      end: a.ends_at,
      customerName: a.customer_name,
      phone: a.phone,
      email: a.email,
      address: a.address,
      note: a.note,
      hasLightBill: (count ?? 0) > 0,
      source: a.source,
    });
    const { error: linkError } = await admin
      .from('hub_appointments')
      .update({ google_event_id: eventId, google_sync_error: null })
      .eq('id', id);
    if (linkError) {
      // Without the stored id, "Sync now" would create a second event — undo this one.
      await deleteEvent(conn, eventId).catch(() => {});
      throw new GoogleError(`could not save Google event id: ${linkError.message}`);
    }
    return null;
  } catch (e) {
    const msg = e instanceof GoogleError ? e.message : 'Google Calendar sync failed';
    console.error('[schedule:sync]', e);
    await admin.from('hub_appointments').update({ google_sync_error: msg }).eq('id', id);
    return msg;
  }
}

async function cancel(admin: Admin, user: HubUser, id: string) {
  const { data: a } = await admin.from('hub_appointments').select('id, status, google_event_id').eq('id', id).maybeSingle();
  if (!a) return fail(404, 'not_found', 'Appointment not found.');
  if (a.status === 'cancelled') return json({ ok: true });

  const { error } = await admin
    .from('hub_appointments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq('id', id);
  if (error) return fail(500, 'save_failed', 'Could not cancel the appointment.');

  let warning: string | null = null;
  if (a.google_event_id) {
    const manual = 'Cancelled here, but the Google Calendar event could not be removed. Delete it on your phone.';
    const conn = googleConfigured() ? await loadConnection(admin) : null;
    if (!conn) {
      warning = manual; // Google was disconnected after this event was created
    } else {
      try {
        await deleteEvent(conn, a.google_event_id);
      } catch (e) {
        console.error('[schedule:cancel:google]', e);
        warning = manual;
      }
    }
  }
  return json({ ok: true, warning });
}

async function disconnect(admin: Admin) {
  const conn = await loadConnection(admin);
  if (conn) await revokeToken(conn.refreshToken);
  await admin.from('hub_google_credentials').delete().eq('id', 1);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  const admin = adminClient();
  if (!admin) return notConfigured(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

  const user = await hubUser(admin, req);
  if (!user) return fail(401, 'unauthorized', 'Please sign in to the dashboard.');

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* empty body → status */ }
  const action = String(body.action || 'status');

  try {
    if (action === 'status') return await status(admin);
    if (user.role !== 'owner') return fail(403, 'forbidden', 'Only the owner can change the schedule.');
    if (action === 'create') return await create(admin, user, body);
    if (action === 'cancel') return await cancel(admin, user, String(body.id || ''));
    if (action === 'resync') {
      const err = await syncToGoogle(admin, String(body.id || ''));
      return err ? fail(502, 'sync_failed', err) : json({ ok: true });
    }
    if (action === 'disconnect') return await disconnect(admin);
    return fail(400, 'bad_request', 'Unknown action.');
  } catch (e) {
    console.error('[schedule]', e);
    return fail(500, 'server_error', 'Something went wrong.');
  }
});
