// Google Calendar integration: OAuth, free/busy, and event create/delete.
// The refresh token is stored in public.hub_google_credentials (service role only)
// and never leaves the server.

import type { Admin } from './db.ts';
import { env, siteUrl } from './http.ts';
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
  calendarId: string;
  email: string | null;
  connectedAt: string;
  refreshToken: string;
}

export async function loadConnection(admin: Admin): Promise<Connection | null> {
  const { data, error } = await admin
    .from('hub_google_credentials')
    .select('calendar_id, google_email, connected_at, refresh_token')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    calendarId: data.calendar_id,
    email: data.google_email,
    connectedAt: data.connected_at,
    refreshToken: data.refresh_token,
  };
}

const tokenCache: { token?: string; exp?: number; for?: string } = {};

export async function accessToken(conn: Connection) {
  if (tokenCache.token && tokenCache.for === conn.refreshToken && (tokenCache.exp ?? 0) > Date.now() + 60_000) {
    return tokenCache.token;
  }
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
    // invalid_grant = Horace revoked access or the token expired → he must reconnect.
    throw new GoogleError(`token refresh failed: ${data.error || res.status}`, res.status, data.error === 'invalid_grant');
  }
  tokenCache.token = data.access_token;
  tokenCache.exp = Date.now() + (Number(data.expires_in) || 3000) * 1000;
  tokenCache.for = conn.refreshToken;
  return data.access_token as string;
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

export interface EventDetails {
  appointmentId: string;
  start: string;
  end: string;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  hasLightBill: boolean;
  source: 'public' | 'dashboard';
}

export async function createEvent(conn: Connection, d: EventDetails) {
  const lines = [
    d.source === 'public' ? 'Booked online via The Power Genie booking page.' : 'Added from The Power Genie dashboard.',
    '',
    `Customer: ${d.customerName}`,
    d.phone ? `Phone: ${d.phone}` : '',
    d.email ? `Email: ${d.email}` : '',
    d.address ? `Address: ${d.address}` : '',
    d.note ? `Note: ${d.note}` : '',
    '',
    d.hasLightBill
      ? "Light bill: uploaded. Open the Power Genie dashboard → Schedule to view it (it isn't attached here for privacy)."
      : 'Light bill: not uploaded.',
    `${siteUrl()}/dashboard?tab=schedule`,
  ].filter((l, i, a) => l !== '' || (a[i - 1] ?? '') !== '');

  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: `Solar consult — ${d.customerName}`,
      location: d.address || undefined,
      description: lines.join('\n'),
      start: { dateTime: d.start, timeZone: SLOT_TIME_ZONE },
      end: { dateTime: d.end, timeZone: SLOT_TIME_ZONE },
      reminders: { useDefault: true },
      extendedProperties: { private: { powerGenieAppointmentId: d.appointmentId } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`event create failed: ${res.status} ${data.error?.message ?? ''}`, res.status);
  return data.id as string;
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
