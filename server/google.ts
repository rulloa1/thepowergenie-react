import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerDetails } from '../src/lib/bookingForm.js';
import { calendarEventDescription } from '../src/lib/lightBill.js';
import type { BusyRange } from '../src/lib/slots.js';
import { BOOKING_TIME_ZONE } from '../src/lib/slots.js';
import type { GoogleEnv, ServerEnv } from './env.js';
import { googleReady } from './env.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_SCOPE = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

export class CalendarCheckFailed extends Error {
  constructor(message = 'Google Calendar could not be checked.') {
    super(message);
    this.name = 'CalendarCheckFailed';
  }
}

export class CalendarNotConnected extends Error {
  constructor() {
    super('Google Calendar is not connected.');
    this.name = 'CalendarNotConnected';
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

type Connection = {
  refreshToken: string;
  calendarId: string;
  googleEmail: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

async function readConnection(admin: SupabaseClient): Promise<Connection | null> {
  // refresh_token stays in this process. Do not return it from an HTTP handler.
  const { data, error } = await admin
    .from('google_calendar_connections')
    .select('refresh_token, calendar_id, google_email')
    .limit(1)
    .maybeSingle();
  if (error) throw new CalendarCheckFailed('Could not read the calendar connection.');
  const row = asRecord(data);
  if (!row || typeof row.refresh_token !== 'string' || row.refresh_token.length < 8) return null;
  return {
    refreshToken: row.refresh_token,
    calendarId: typeof row.calendar_id === 'string' && row.calendar_id ? row.calendar_id : 'primary',
    googleEmail: typeof row.google_email === 'string' ? row.google_email : null,
  };
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    console.error('google token request failed', response.status);
    throw new CalendarCheckFailed('Google did not accept the calendar connection.');
  }
  return json;
}

async function accessTokenFor(env: GoogleEnv, connection: Connection): Promise<string> {
  const json = await postToken(new URLSearchParams({
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    refresh_token: connection.refreshToken,
    grant_type: 'refresh_token',
  }));
  if (!json.access_token) throw new CalendarCheckFailed('Google did not return an access token.');
  return json.access_token;
}

export function buildGoogleAuthUrl(env: GoogleEnv, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', env.googleClientId);
  url.searchParams.set('redirect_uri', env.googleRedirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', CALENDAR_SCOPE);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function createOauthState(admin: SupabaseClient, userId: string): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await admin.from('oauth_states').delete().lt('expires_at', new Date().toISOString());
  const { error } = await admin.from('oauth_states').insert({
    state,
    user_id: userId,
    expires_at: expires,
  });
  if (error) throw new CalendarCheckFailed('Could not start the Google connection.');
  return state;
}

export async function consumeOauthState(admin: SupabaseClient, state: string): Promise<string | null> {
  const { data, error } = await admin
    .from('oauth_states')
    .select('user_id, expires_at')
    .eq('state', state)
    .maybeSingle();
  await admin.from('oauth_states').delete().eq('state', state);
  if (error || !data) return null;
  const row = asRecord(data);
  if (!row || typeof row.user_id !== 'string' || typeof row.expires_at !== 'string') return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

export async function exchangeCode(env: GoogleEnv, code: string): Promise<TokenResponse> {
  return postToken(new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: env.googleRedirectUri,
    grant_type: 'authorization_code',
  }));
}

async function googleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const json = asRecord(await response.json().catch(() => null));
  return json && typeof json.email === 'string' ? json.email : null;
}

export async function saveRefreshToken(
  admin: SupabaseClient,
  tokens: TokenResponse,
  connectedBy: string,
): Promise<void> {
  if (!tokens.refresh_token || !tokens.access_token) {
    throw new CalendarCheckFailed('Google did not return a refresh token.');
  }
  const email = await googleEmail(tokens.access_token);
  const { data: existing, error: readError } = await admin
    .from('google_calendar_connections')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (readError) throw new CalendarCheckFailed('Could not store the calendar connection.');
  const payload = {
    refresh_token: tokens.refresh_token,
    google_email: email,
    calendar_id: 'primary',
    connected_by: connectedBy,
    updated_at: new Date().toISOString(),
  };
  const existingRow = asRecord(existing);
  if (existingRow && typeof existingRow.id === 'string') {
    const { error } = await admin.from('google_calendar_connections').update(payload).eq('id', existingRow.id);
    if (error) throw new CalendarCheckFailed('Could not store the calendar connection.');
    return;
  }
  const { error } = await admin.from('google_calendar_connections').insert(payload);
  if (error) throw new CalendarCheckFailed('Could not store the calendar connection.');
}

export async function connectionStatus(admin: SupabaseClient): Promise<{ connected: boolean; googleEmail: string | null }> {
  const connection = await readConnection(admin);
  if (!connection) return { connected: false, googleEmail: null };
  return { connected: true, googleEmail: connection.googleEmail };
}

async function authorizedConnection(admin: SupabaseClient, env: ServerEnv): Promise<{
  env: GoogleEnv;
  connection: Connection;
  accessToken: string;
} | null> {
  const connection = await readConnection(admin);
  if (!connection) return null;
  if (!googleReady(env)) throw new CalendarCheckFailed('Google Calendar keys are missing on the server.');
  const accessToken = await accessTokenFor(env, connection);
  return { env, connection, accessToken };
}

export async function fetchGoogleBusy(
  admin: SupabaseClient,
  env: ServerEnv,
  timeMin: Date,
  timeMax: Date,
): Promise<{ connected: boolean; ranges: BusyRange[] }> {
  const authorized = await authorizedConnection(admin, env);
  if (!authorized) return { connected: false, ranges: [] };

  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authorized.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: BOOKING_TIME_ZONE,
      items: [{ id: authorized.connection.calendarId }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = asRecord(await response.json().catch(() => null));
  if (!response.ok || !json) {
    console.error('google freebusy failed', response.status);
    throw new CalendarCheckFailed('Google Calendar could not be checked.');
  }
  const calendars = asRecord(json.calendars);
  const calendar = calendars ? asRecord(calendars[authorized.connection.calendarId]) : null;
  const fallback = calendars ? asRecord(Object.values(calendars)[0]) : null;
  const entry = calendar ?? fallback;
  if (!entry) return { connected: true, ranges: [] };
  if (Array.isArray(entry.errors) && entry.errors.length > 0) {
    throw new CalendarCheckFailed('Google Calendar could not be checked.');
  }
  const busy = Array.isArray(entry.busy) ? entry.busy : [];
  const ranges: BusyRange[] = [];
  for (const item of busy) {
    const row = asRecord(item);
    if (!row || typeof row.start !== 'string' || typeof row.end !== 'string') continue;
    const start = new Date(row.start);
    const end = new Date(row.end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) ranges.push({ start, end });
  }
  return { connected: true, ranges };
}

export async function createGoogleEvent(
  admin: SupabaseClient,
  env: ServerEnv,
  input: { customer: CustomerDetails; starts: Date; ends: Date; lightBillAttached?: boolean },
): Promise<string> {
  const authorized = await authorizedConnection(admin, env);
  if (!authorized) throw new CalendarNotConnected();
  const calendarId = encodeURIComponent(authorized.connection.calendarId);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authorized.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `Power Genie call — ${input.customer.name}`.slice(0, 200),
      description: calendarEventDescription({
        customer: input.customer,
        lightBillAttached: input.lightBillAttached === true,
        site: env.publicSiteUrl,
      }),
      start: { dateTime: input.starts.toISOString(), timeZone: BOOKING_TIME_ZONE },
      end: { dateTime: input.ends.toISOString(), timeZone: BOOKING_TIME_ZONE },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = asRecord(await response.json().catch(() => null));
  if (!response.ok || !json || typeof json.id !== 'string') {
    console.error('google create event failed', response.status);
    throw new CalendarCheckFailed('Could not add the call to Google Calendar.');
  }
  return json.id;
}

export async function updateGoogleEventDescription(
  admin: SupabaseClient,
  env: ServerEnv,
  eventId: string,
  description: string,
): Promise<void> {
  const authorized = await authorizedConnection(admin, env);
  if (!authorized) throw new CalendarNotConnected();
  const calendarId = encodeURIComponent(authorized.connection.calendarId);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authorized.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) {
    console.error('google update event failed', response.status);
    throw new CalendarCheckFailed('Could not update the Google Calendar event.');
  }
}

export async function deleteGoogleEvent(admin: SupabaseClient, env: ServerEnv, eventId: string): Promise<void> {
  const authorized = await authorizedConnection(admin, env);
  if (!authorized) throw new CalendarNotConnected();
  const calendarId = encodeURIComponent(authorized.connection.calendarId);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authorized.accessToken}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    console.error('google delete event failed', response.status);
    throw new CalendarCheckFailed('Could not remove the Google Calendar event.');
  }
}
