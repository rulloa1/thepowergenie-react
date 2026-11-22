// Dashboard schedule endpoint (signed-in Referral Hub members only).
//
//   POST { action: 'status' }                          → this member's Google connection + busy blocks
//   POST { action: 'create', start, durationMinutes, name, phone?, email?, address?, note? }  (owner or admin)
//   POST { action: 'reschedule', id, start, durationMinutes }  (owner) moves every member's event
//   POST { action: 'cancel', id }                       (owner) deletes every member's event
//   POST { action: 'resync', id }                       retry a hub appointment on every calendar
//   POST { action: 'resync_customer', id }             retry an assistant lead on every calendar
//   POST { action: 'disconnect' }                       forget this member's Google connection

import { adminClient, bookedIntervals, hubUser, type Admin, type HubUser } from '../_shared/db.ts';
import { env, fail, json, notConfigured, preflight } from '../_shared/http.ts';
import {
  availabilityBusy,
  deleteHubAppointmentEvents,
  freeBusy,
  GoogleError,
  googleConfigured,
  loadConnections,
  missingRelation,
  revokeToken,
  syncCustomerConsult,
  syncHubAppointment,
  type Connection,
} from '../_shared/google.ts';
import { bookingWindow, SLOT_TIME_ZONE } from '../_shared/slots.ts';

import { notifyAppointment } from '../_shared/appointment-alert.ts';
import { dashboardLeadUrl, siteOrigin } from '../_shared/notify.ts';

async function emailBooking(admin: Admin, a: { id: string; source: string; customer_name: string; starts_at: string; address: string | null; email: string | null; phone: string | null; kwh?: number | null; bill_amount?: number | null }, includeTeam: boolean) {
  const { count } = await admin.from('hub_appointment_files').select('id', { head: true, count: 'exact' }).eq('appointment_id', a.id).eq('kind', 'light_bill');
  return notifyAppointment(admin, { id: a.id, source: a.source === 'public' ? 'booking' : 'dashboard', name: a.customer_name,
    email: a.email, phone: a.phone, address: a.address || '', kwh: a.kwh ?? null, amount: a.bill_amount ?? null,
    appointment: new Date(a.starts_at).toLocaleString('en-US', { timeZone: SLOT_TIME_ZONE, timeZoneName: 'short' }),
    billAttached: !!count, dashboardUrl: dashboardLeadUrl(siteOrigin(env('SITE_URL')), a.id) }, includeTeam);
}

const MINUTE = 60_000;

function publicMember(connection: Connection) {
  return {
    userId: connection.userId,
    fullName: connection.fullName,
    role: connection.role,
    requiredForAvailability: connection.role === 'owner' || connection.requiredForAvailability,
  };
}

async function status(admin: Admin, user: HubUser) {
  const configured = googleConfigured();
  const connections = configured ? await loadConnections(admin) : [];
  const mine = connections.find((connection) => connection.userId === user.id) ?? null;
  const google = {
    configured,
    connected: !!mine,
    email: mine?.email ?? null,
    connectedAt: mine?.connectedAt ?? null,
    error: null as string | null,
    needsReconnect: false,
  };
  let busy: { start: string; end: string }[] = [];
  if (mine) {
    const { timeMin, timeMax } = bookingWindow(new Date());
    try {
      busy = await freeBusy(mine, timeMin, timeMax);
    } catch (e) {
      console.error('[schedule:status]', e);
      google.error = 'Could not reach Google Calendar.';
      google.needsReconnect = e instanceof GoogleError && e.reconnect;
    }
  }
  return json({
    timeZone: SLOT_TIME_ZONE,
    google,
    members: connections.filter((connection) => connection.userId).map(publicMember),
    busy,
  });
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

  // Same checks as the public page: database + Google busy time on Horace's
  // calendar and any member marked required_for_availability.
  const clash = await bookedIntervals(admin, start.toISOString(), end.toISOString());
  if (clash.length) return fail(409, 'slot_unavailable', 'That time overlaps another appointment.');

  if (googleConfigured() && body.ignoreGoogleBusy !== true) {
    try {
      const busy = await availabilityBusy(admin, start.toISOString(), end.toISOString());
      if (busy.length) {
        return fail(409, 'google_busy', 'That time is busy on the calendar used for availability. Add it anyway?');
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

  const warning = await syncHubAppointment(admin, appt, { hasLightBill: false });
  await emailBooking(admin, appt, true);
  return json({ ok: true, id: appt.id, warning });
}

async function syncToGoogle(admin: Admin, id: string) {
  const { data: a } = await admin.from('hub_appointments').select('*').eq('id', id).single();
  if (!a || a.status !== 'booked') return 'Appointment not found.';
  const connections = googleConfigured() ? await loadConnections(admin) : [];
  if (!connections.length) return 'Google Calendar is not connected.';
  const { count } = await admin
    .from('hub_appointment_files')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', id);
  return syncHubAppointment(admin, a, { hasLightBill: (count ?? 0) > 0 });
}

async function reschedule(admin: Admin, body: Record<string, unknown>) {
  const id = String(body.id || '');
  const start = new Date(typeof body.start === 'string' ? body.start : '');
  const duration = Number(body.durationMinutes ?? 60);
  if (!id) return fail(400, 'invalid', 'Appointment not found.');
  if (Number.isNaN(start.getTime())) return fail(400, 'invalid', 'Pick a valid start time.');
  if (start.getTime() % (15 * MINUTE) !== 0) return fail(400, 'invalid', 'Start times must be on a 15-minute mark.');
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) return fail(400, 'invalid', 'Duration must be 15–480 minutes.');
  if (start.getTime() < Date.now() - 5 * MINUTE) return fail(400, 'invalid', 'That time is in the past.');
  const end = new Date(start.getTime() + duration * MINUTE);

  const { data: current } = await admin.from('hub_appointments').select('*').eq('id', id).maybeSingle();
  if (!current || current.status !== 'booked') return fail(404, 'not_found', 'Appointment not found.');

  const clash = await bookedIntervals(admin, start.toISOString(), end.toISOString(), id);
  if (clash.length) return fail(409, 'slot_unavailable', 'That time overlaps another appointment.');
  if (googleConfigured() && body.ignoreGoogleBusy !== true) {
    try {
      const busy = await availabilityBusy(admin, start.toISOString(), end.toISOString());
      // The event already on the availability calendar is this appointment. Ignore that
      // block so moving it does not collide with itself.
      const ownStart = new Date(current.starts_at).getTime();
      const ownEnd = new Date(current.ends_at).getTime();
      const otherBusy = busy.filter((block) => new Date(block.start).getTime() !== ownStart || new Date(block.end).getTime() !== ownEnd);
      if (otherBusy.length) {
        return fail(409, 'google_busy', 'That time is busy on the calendar used for availability. Add it anyway?');
      }
    } catch (e) {
      console.error('[schedule:reschedule:freebusy]', e);
      return fail(503, 'calendar_unavailable', 'Could not check Google Calendar. Try again, or reconnect it.');
    }
  }

  const { data: appt, error } = await admin
    .from('hub_appointments')
    .update({ starts_at: start.toISOString(), ends_at: end.toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !appt) {
    if (error?.code === '23P01') return fail(409, 'slot_unavailable', 'That time overlaps another appointment.');
    console.error('[schedule:reschedule]', error);
    return fail(500, 'save_failed', 'Could not move the appointment.');
  }
  const { count } = await admin
    .from('hub_appointment_files')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', id);
  const syncError = await syncHubAppointment(admin, appt, { hasLightBill: (count ?? 0) > 0 });
  return json({ ok: true, warning: syncError });
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

  const warning = await deleteHubAppointmentEvents(admin, id, a.google_event_id);
  return json({ ok: true, warning });
}

async function resyncCustomer(admin: Admin, id: string) {
  if (!id) return 'Appointment not found.';
  const { data, error } = await admin
    .from('powergenie_customers')
    .select('id, customer_name, phone, email, service_address, notes, appointment_date')
    .eq('id', id)
    .maybeSingle();
  if (error || !data?.appointment_date) return 'Appointment not found.';
  const raw = Number(env('SLOT_DURATION_MINUTES'));
  const durationMinutes = Number.isInteger(raw) && raw >= 30 && raw <= 240 ? raw : 60;
  return syncCustomerConsult(admin, { ...data, durationMinutes });
}

async function disconnect(admin: Admin, user: HubUser) {
  const connections = googleConfigured() ? await loadConnections(admin) : [];
  const mine = connections.find((connection) => connection.userId === user.id);
  if (mine) await revokeToken(mine.refreshToken);
  const accounts = await admin.from('hub_google_accounts').delete().eq('user_id', user.id);
  if (accounts.error && !missingRelation(accounts.error)) throw accounts.error;
  const legacy = await admin.from('hub_google_credentials').delete().eq('connected_by', user.id);
  if (legacy.error && !missingRelation(legacy.error)) throw legacy.error;
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
    if (action === 'status') return await status(admin, user);
    if (action === 'disconnect') return await disconnect(admin, user);
    if (action === 'resync' || action === 'resync_customer') {
      const err = action === 'resync'
        ? await syncToGoogle(admin, String(body.id || ''))
        : await resyncCustomer(admin, String(body.id || ''));
      return err ? fail(502, 'sync_failed', err) : json({ ok: true });
    }
    if (action === 'create') return await create(admin, user, body);
    if (user.role !== 'owner') return fail(403, 'forbidden', 'Only the owner can reschedule or cancel appointments.');
    if (action === 'retry_owner_email') {
      const { data: a } = await admin.from('hub_appointments').select('*').eq('id', String(body.id || '')).eq('status','booked').maybeSingle();
      if (!a) return fail(404, 'not_found', 'Appointment not found.');
      const status = a.owner_email_status === 'accepted' ? 'accepted' : await emailBooking(admin, a, false);
      return json({ status });
    }
    if (action === 'reschedule') return await reschedule(admin, body);
    if (action === 'cancel') return await cancel(admin, user, String(body.id || ''));
    return fail(400, 'bad_request', 'Unknown action.');
  } catch (e) {
    console.error('[schedule]', e);
    return fail(500, 'server_error', 'Something went wrong.');
  }
});
