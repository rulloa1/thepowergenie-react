// Google Calendar integration: OAuth, free/busy, and event create/update/delete.
// Refresh tokens live in hub_google_accounts (one per hub member). Until that
// migration is applied, the original hub_google_credentials row is still read.
// Tokens never leave the server.

import {
  availabilityMembers,
  consultEventBody,
  fanOutCalendars,
  removeCalendars,
  syncErrorMessage,
  syncSummary,
  type ConsultDetails,
  type MemberSyncResult,
  type StoredCalendarEvent,
} from './calendar-sync.ts';
import type { Admin } from './db.ts';
import { env } from './http.ts';
import { dashboardLeadUrl, siteOrigin } from './notify.ts';
import { SLOT_TIME_ZONE } from './slots.ts';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

export function googleConfigured() {
  return !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
}

export function redirectUri() {
  return env('GOOGLE_REDIRECT_URI') || `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/google-oauth`;
}

export class GoogleError extends Error {
  constructor(message: string, public status = 0, public reconnect = false) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Signed OAuth state (HMAC with the client secret; no extra table needed)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey() {
  return crypto.subtle.importKey('raw', enc.encode(env('GOOGLE_CLIENT_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signState(userId: string) {
  const payload = b64url(enc.encode(JSON.stringify({ u: userId, e: Date.now() + 10 * 60_000, n: crypto.randomUUID() })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyState(state: string): Promise<string | null> {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof data.u !== 'string' || typeof data.e !== 'number' || data.e < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}

export function authUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`token exchange failed: ${data.error || res.status}`, res.status);
  let email: string | null = null;
  if (data.id_token) {
    try {
      const claims = JSON.parse(new TextDecoder().decode(fromB64url(String(data.id_token).split('.')[1])));
      email = claims.email ?? null;
    } catch { /* email is optional */ }
  }
  return {
    refreshToken: data.refresh_token as string | undefined,
    accessToken: data.access_token as string,
    scope: data.scope as string | undefined,
    email,
  };
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Connected calendar
// ---------------------------------------------------------------------------

export interface Connection {
  /** Null only for a legacy row that was saved before connected_by existed. */
  userId: string | null;
  role: 'owner' | 'admin';
  fullName: string | null;
  calendarId: string;
  email: string | null;
  connectedAt: string;
  refreshToken: string;
  /** Extra free/busy source. The owner is always included, flag or not. */
  requiredForAvailability: boolean;
}

type ProfileRow = { id: string; role: string; full_name: string | null; email: string | null };

export function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') return true;
  const message = (error.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('schema cache');
}

function asRole(value: string | null | undefined): 'owner' | 'admin' {
  return value === 'admin' ? 'admin' : 'owner';
}

async function loadProfiles(admin: Admin): Promise<ProfileRow[]> {
  const { data, error } = await admin.from('hub_profiles').select('id, role, full_name, email');
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

async function loadLegacyConnection(admin: Admin, profiles: ProfileRow[]): Promise<Connection | null> {
  const { data, error } = await admin
    .from('hub_google_credentials')
    .select('connected_by, calendar_id, google_email, connected_at, refresh_token')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) return null;
  const profile = profiles.find((row) => row.id === data.connected_by);
  return {
    userId: (data.connected_by as string | null) ?? null,
    role: asRole(profile?.role),
    fullName: profile?.full_name ?? null,
    calendarId: data.calendar_id,
    email: data.google_email,
    connectedAt: data.connected_at,
    refreshToken: data.refresh_token,
    requiredForAvailability: false,
  };
}

/** Every connected member. Falls back to the original single-row connection. */
export async function loadConnections(admin: Admin): Promise<Connection[]> {
  const profiles = await loadProfiles(admin);
  const { data, error } = await admin
    .from('hub_google_accounts')
    .select('user_id, google_email, calendar_id, refresh_token, required_for_availability, connected_at');
  if (error && missingRelation(error)) {
    const legacy = await loadLegacyConnection(admin, profiles);
    return legacy ? [legacy] : [];
  }
  if (error) throw error;

  const connections = new Map<string, Connection>();
  for (const row of data ?? []) {
    if (!row.user_id || !row.refresh_token) continue;
    const profile = profiles.find((item) => item.id === row.user_id);
    connections.set(row.user_id, {
      userId: row.user_id,
      role: profile ? asRole(profile.role) : 'admin',
      fullName: profile?.full_name ?? null,
      calendarId: row.calendar_id || 'primary',
      email: row.google_email,
      connectedAt: row.connected_at,
      refreshToken: row.refresh_token,
      requiredForAvailability: row.required_for_availability === true,
    });
  }

  // Keep Horace's original token until he connects again into the new table.
  const legacy = await loadLegacyConnection(admin, profiles).catch((error) => {
    console.error('[calendar] legacy credentials', error instanceof Error ? error.message : 'unknown');
    return null;
  });
  if (legacy?.userId && !connections.has(legacy.userId)) connections.set(legacy.userId, legacy);
  return [...connections.values()];
}

/** @deprecated Use loadConnections. Returns the owner's connection when present. */
export async function loadConnection(admin: Admin): Promise<Connection | null> {
  const connections = await loadConnections(admin);
  return connections.find((connection) => connection.role === 'owner') ?? connections[0] ?? null;
}

export async function availabilityBusy(admin: Admin, timeMin: string, timeMax: string) {
  if (!googleConfigured()) return [] as { start: string; end: string }[];
  const required = availabilityMembers(await loadConnections(admin));
  if (!required.length) return [] as { start: string; end: string }[];
  const lists = await Promise.all(required.map((connection) => freeBusy(connection, timeMin, timeMax)));
  return lists.flat();
}

const tokenCache = new Map<string, { token: string; exp: number }>();
const tokenInflight = new Map<string, Promise<string>>();

export async function accessToken(conn: Connection) {
  const cached = tokenCache.get(conn.refreshToken);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const pending = tokenInflight.get(conn.refreshToken);
  if (pending) return pending;
  const promise = refreshAccessToken(conn).finally(() => tokenInflight.delete(conn.refreshToken));
  tokenInflight.set(conn.refreshToken, promise);
  return promise;
}

async function refreshAccessToken(conn: Connection) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = the member revoked access or the token expired → they must reconnect.
    throw new GoogleError(`token refresh failed: ${data.error || res.status}`, res.status, data.error === 'invalid_grant');
  }
  const token = data.access_token as string;
  tokenCache.set(conn.refreshToken, { token, exp: Date.now() + (Number(data.expires_in) || 3000) * 1000 });
  return token;
}

async function calendarFetch(conn: Connection, path: string, init: RequestInit = {}) {
  const token = await accessToken(conn);
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  return res;
}

/** Busy intervals on the connected calendar. Throws GoogleError if Google can't answer. */
export async function freeBusy(conn: Connection, timeMin: string, timeMax: string) {
  const res = await calendarFetch(conn, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({ timeMin, timeMax, timeZone: SLOT_TIME_ZONE, items: [{ id: conn.calendarId }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`freeBusy failed: ${res.status}`, res.status, res.status === 401);
  const cal = data.calendars?.[conn.calendarId];
  if (!cal || (cal.errors && cal.errors.length)) {
    throw new GoogleError(`freeBusy calendar error: ${JSON.stringify(cal?.errors ?? 'missing')}`);
  }
  return (cal.busy ?? []) as { start: string; end: string }[];
}

export async function createEvent(conn: Connection, details: ConsultDetails) {
  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(consultEventBody(details)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`event create failed: ${res.status} ${data.error?.message ?? ''}`, res.status);
  return data.id as string;
}

export async function updateEvent(conn: Connection, eventId: string, details: ConsultDetails) {
  const res = await calendarFetch(
    conn,
    `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(consultEventBody(details)) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`event update failed: ${res.status} ${data.error?.message ?? ''}`, res.status);
}

/** Reuse an event created earlier if the id was never stored (retry after a crash). */
export async function findEventId(conn: Connection, appointmentId: string): Promise<string | null> {
  const params = new URLSearchParams({
    privateExtendedProperty: `powerGenieAppointmentId=${appointmentId}`,
    maxResults: '1',
    singleEvents: 'true',
  });
  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const id = data.items?.[0]?.id;
  return typeof id === 'string' ? id : null;
}

export async function deleteEvent(conn: Connection, eventId: string) {
  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
  // 404/410: already gone (deleted on the phone) — that's fine.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new GoogleError(`event delete failed: ${res.status}`, res.status);
  }
}

export function leadUrl(id: string) {
  return dashboardLeadUrl(siteOrigin(env('SITE_URL')), id);
}

async function placeEvent(conn: Connection, details: ConsultDetails) {
  const existing = await findEventId(conn, details.id);
  if (existing) {
    await updateEvent(conn, existing, details);
    return existing;
  }
  return createEvent(conn, details);
}

// ---------------------------------------------------------------------------
// Fan-out: one event on every connected member's calendar
// ---------------------------------------------------------------------------

export type CalendarTarget = { kind: 'appointment' | 'customer'; id: string };

type AppointmentSyncRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  source: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  google_event_id: string | null;
  status?: string;
};

function addressable(connections: Connection[]): Array<Connection & { userId: string }> {
  return connections.filter((connection): connection is Connection & { userId: string } => !!connection.userId);
}

async function loadStored(admin: Admin, target: CalendarTarget): Promise<{ rows: StoredCalendarEvent[]; missing: boolean }> {
  const column = target.kind === 'appointment' ? 'appointment_id' : 'customer_id';
  const { data, error } = await admin
    .from('hub_calendar_events')
    .select('user_id, google_event_id, sync_error')
    .eq(column, target.id);
  if (error && missingRelation(error)) return { rows: [], missing: true };
  if (error) throw error;
  return {
    missing: false,
    rows: (data ?? []).map((row) => ({
      userId: row.user_id as string,
      googleEventId: (row.google_event_id as string | null) ?? null,
      syncError: (row.sync_error as string | null) ?? null,
    })),
  };
}

async function saveStored(admin: Admin, target: CalendarTarget, results: MemberSyncResult[]) {
  const column = target.kind === 'appointment' ? 'appointment_id' : 'customer_id';
  for (const result of results) {
    const { data: existing, error: readError } = await admin
      .from('hub_calendar_events')
      .select('id')
      .eq(column, target.id)
      .eq('user_id', result.userId)
      .maybeSingle();
    if (readError) throw readError;
    const row = {
      appointment_id: target.kind === 'appointment' ? target.id : null,
      customer_id: target.kind === 'customer' ? target.id : null,
      user_id: result.userId,
      google_event_id: result.googleEventId,
      sync_error: result.syncError,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await admin.from('hub_calendar_events').update(row).eq('id', existing.id)
      : await admin.from('hub_calendar_events').insert(row);
    if (error) throw error;
  }
}

function logFailures(target: CalendarTarget, results: MemberSyncResult[]) {
  for (const result of results) {
    if (!result.syncError) continue;
    console.error('[calendar]', target.kind, target.id, result.userId, result.syncError);
  }
}

async function rememberAppointment(admin: Admin, appointmentId: string, members: Connection[], results: MemberSyncResult[]) {
  const owner = members.find((member) => member.role === 'owner' && member.userId);
  const ownerResult = owner ? results.find((result) => result.userId === owner.userId) : undefined;
  const fallback = results.find((result) => result.googleEventId);
  const { error } = await admin
    .from('hub_appointments')
    .update({
      google_event_id: ownerResult?.googleEventId ?? fallback?.googleEventId ?? null,
      google_sync_error: syncSummary(results),
    })
    .eq('id', appointmentId);
  if (error) throw error;
}

/** Push a hub appointment onto every connected calendar. Does not throw. */
export async function syncHubAppointment(
  admin: Admin,
  appt: AppointmentSyncRow,
  extras: { hasLightBill: boolean } = { hasLightBill: false },
): Promise<string | null> {
  try {
    if (!googleConfigured() || appt.status === 'cancelled') return null;
    const members = addressable(await loadConnections(admin));
    if (!members.length) return null;
    const target: CalendarTarget = { kind: 'appointment', id: appt.id };
    const stored = await loadStored(admin, target);
    let rows = stored.rows;
    if (!rows.length && appt.google_event_id) {
      const owner = members.find((member) => member.role === 'owner');
      if (owner) rows = [{ userId: owner.userId, googleEventId: appt.google_event_id, syncError: null }];
    }
    const details: ConsultDetails = {
      id: appt.id,
      start: appt.starts_at,
      end: appt.ends_at,
      customerName: appt.customer_name,
      phone: appt.phone,
      email: appt.email,
      address: appt.address,
      note: appt.note,
      dashboardUrl: leadUrl(appt.id),
      source: appt.source === 'public' ? 'public' : 'dashboard',
      hasLightBill: extras.hasLightBill,
    };
    const results = await fanOutCalendars({
      members,
      stored: rows,
      createEvent: (member) => placeEvent(member, details),
      updateEvent: (member, eventId) => updateEvent(member, eventId, details),
    });
    logFailures(target, results);
    if (!stored.missing) await saveStored(admin, target, results);
    await rememberAppointment(admin, appt.id, members, results);
    return syncSummary(results);
  } catch (error) {
    const message = syncErrorMessage(error);
    console.error('[calendar] appointment', appt.id, message);
    await admin.from('hub_appointments').update({ google_sync_error: message }).eq('id', appt.id);
    return message;
  }
}

export async function syncCustomerConsult(
  admin: Admin,
  customer: {
    id: string;
    customer_name: string;
    phone?: string | null;
    email?: string | null;
    service_address?: string | null;
    notes?: string | null;
    appointment_date: string;
    durationMinutes: number;
  },
): Promise<string | null> {
  try {
    if (!googleConfigured()) return null;
    const members = addressable(await loadConnections(admin));
    if (!members.length) return null;
    const startMs = Date.parse(customer.appointment_date);
    if (!Number.isFinite(startMs)) return 'Appointment time is not valid.';
    const target: CalendarTarget = { kind: 'customer', id: customer.id };
    const stored = await loadStored(admin, target);
    if (stored.missing) {
      console.error('[calendar] hub_calendar_events is missing; apply the member calendar migration');
      return 'Calendar sync is not set up yet.';
    }
    const noteLine = (customer.notes || '').split('\n').find((line) => line.startsWith('Preferred windows: '));
    const details: ConsultDetails = {
      id: customer.id,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + customer.durationMinutes * 60_000).toISOString(),
      customerName: customer.customer_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.service_address,
      note: noteLine ? noteLine.slice('Preferred windows: '.length) : null,
      dashboardUrl: leadUrl(customer.id),
      source: 'assistant',
      hasLightBill: (customer.notes || '').includes('Bill: attached'),
    };
    const results = await fanOutCalendars({
      members,
      stored: stored.rows,
      createEvent: (member) => placeEvent(member, details),
      updateEvent: (member, eventId) => updateEvent(member, eventId, details),
    });
    logFailures(target, results);
    await saveStored(admin, target, results);
    return syncSummary(results);
  } catch (error) {
    const message = syncErrorMessage(error);
    console.error('[calendar] customer', customer.id, message);
    return message;
  }
}

const CANCEL_WARNING = 'Cancelled here, but a Google Calendar event could not be removed. Delete it on the phone.';

/** Delete every member's event for a hub appointment. Returns a warning, or null. */
export async function deleteHubAppointmentEvents(
  admin: Admin,
  appointmentId: string,
  legacyEventId: string | null,
): Promise<string | null> {
  try {
    if (!googleConfigured()) return legacyEventId ? CANCEL_WARNING : null;
    const members = addressable(await loadConnections(admin));
    const target: CalendarTarget = { kind: 'appointment', id: appointmentId };
    const stored = await loadStored(admin, target);
    let rows = stored.rows;
    if (!rows.some((row) => row.googleEventId) && legacyEventId) {
      const owner = members.find((member) => member.role === 'owner');
      if (owner) rows = [...rows, { userId: owner.userId, googleEventId: legacyEventId, syncError: null }];
    }
    if (!rows.some((row) => row.googleEventId)) return null;
    const outcomes = await removeCalendars({
      members,
      stored: rows,
      deleteEvent: (member, eventId) => deleteEvent(member, eventId),
    });
    for (const outcome of outcomes) {
      if (outcome.error) console.error('[calendar] cancel', appointmentId, outcome.userId, outcome.error);
    }
    if (!stored.missing) {
      for (const outcome of outcomes) {
        const patch = outcome.error
          ? { sync_error: outcome.error, updated_at: new Date().toISOString() }
          : { google_event_id: null, sync_error: null, updated_at: new Date().toISOString() };
        await admin.from('hub_calendar_events').update(patch).eq('appointment_id', appointmentId).eq('user_id', outcome.userId);
      }
    }
    const failed = outcomes.some((outcome) => outcome.error);
    await admin
      .from('hub_appointments')
      .update({ google_event_id: failed ? legacyEventId : null, google_sync_error: failed ? CANCEL_WARNING : null })
      .eq('id', appointmentId);
    return failed ? CANCEL_WARNING : null;
  } catch (error) {
    console.error('[calendar] cancel', appointmentId, syncErrorMessage(error));
    return CANCEL_WARNING;
  }
}
