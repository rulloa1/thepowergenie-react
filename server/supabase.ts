import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ServerEnv } from './env.js'
import { HttpError } from './http.js'

/**
 * Talks to PostgREST and Storage with fetch.
 *
 * The hub's secret key is `sb_secret_...`, which is not a JWT. A legacy
 * service_role JWT is also accepted. The assistant sends either key on the
 * `apikey` header only. Putting it on `Authorization: Bearer` makes Supabase
 * try to verify `sb_secret_` as a JWT and reject the call, so these helpers
 * use fetch. The dashboard helpers further down use supabase-js.
 *
 * The key is also rejected when the User-Agent looks like a browser, so this
 * server identifies itself and never forwards the visitor's User-Agent.
 */
function isServiceRoleJwt(key: string): boolean {
  const parts = key.split('.')
  if (parts.length !== 3 || !parts[1]) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

function keyKind(key: string): string {
  if (!key) return 'missing'
  if (key.startsWith('sb_secret_')) return 'sb_secret'
  if (key.startsWith('sb_publishable_')) return 'publishable'
  if (isServiceRoleJwt(key)) return 'service_role'
  const parts = key.split('.')
  if (parts.length === 3 && parts[1]) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: unknown }
      return `jwt:${typeof payload.role === 'string' ? payload.role : 'unknown'}`
    } catch {
      return 'jwt_unreadable'
    }
  }
  return 'other'
}

export function supabaseConfig(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const accepted =
    key.startsWith('sb_secret_') ||
    process.env.ASSISTANT_ALLOW_LEGACY_KEY === '1' ||
    isServiceRoleJwt(key)
  if (!url || !key || !accepted) {
    const marker = key.includes('_') ? key.slice(0, key.indexOf('_')) : ''
    const prefix = /^[A-Za-z]{2,16}$/.test(marker) ? marker : 'noprefix'
    console.error('assistant_supabase_unconfigured', url ? 'url' : 'no_url', keyKind(key), prefix, key.length)
    throw new HttpError(503, 'Scheduling is not configured yet. Please call Horace and we will set this up.')
  }
  return { url, key }
}

export async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = supabaseConfig()
  const headers = new Headers()
  headers.set('apikey', key)
  headers.set('user-agent', 'PowerGenieWebsite/1.0')
  if (init.headers) {
    new Headers(init.headers).forEach((value, name) => {
      const lower = name.toLowerCase()
      if (lower === 'authorization' || lower === 'apikey' || lower === 'cookie' || lower === 'user-agent') return
      headers.set(name, value)
    })
  }
  return fetch(`${url}${path}`, { ...init, headers })
}

export function encodeObjectPath(path: string): string {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

export async function insertRow(table: string, row: Record<string, unknown>): Promise<'created' | 'exists'> {
  const response = await supabaseFetch(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (response.ok) return 'created'
  if (response.status === 409) return 'exists'
  console.error('supabase_insert_failed', table, response.status)
  throw new HttpError(502, 'We could not save that request. Please try again.')
}

/** Maps an appointment_date to the customer id that holds it. */
export async function takenAppointments(fromDate: string, toDate: string): Promise<Map<string, string>> {
  const params = new URLSearchParams()
  params.set('select', 'id,appointment_date')
  params.append('appointment_date', `gte.${fromDate}`)
  params.append('appointment_date', `lt.${toDate}`)
  params.set('limit', '500')
  const response = await supabaseFetch(`/rest/v1/powergenie_customers?${params.toString()}`)
  if (!response.ok) {
    console.error('supabase_slots_failed', response.status)
    return new Map()
  }
  const rows = (await response.json()) as Array<{ id?: string; appointment_date?: string | null }>
  const taken = new Map<string, string>()
  for (const row of rows) {
    if (typeof row.appointment_date === 'string' && row.appointment_date && typeof row.id === 'string') {
      taken.set(row.appointment_date, row.id)
    }
  }
  return taken
}

type SignedUpload = { url: string; token?: string }

export async function createSignedUpload(objectPath: string): Promise<string> {
  const { url } = supabaseConfig()
  const response = await supabaseFetch(`/storage/v1/object/upload/sign/powergenie/${encodeObjectPath(objectPath)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!response.ok) {
    console.error('supabase_sign_failed', response.status)
    throw new HttpError(502, 'The bill upload could not be started. Please try again.')
  }
  const payload = (await response.json()) as SignedUpload
  let returned = payload.url || ''
  if (payload.token && !returned.includes('token=')) {
    returned += `${returned.includes('?') ? '&' : '?'}token=${encodeURIComponent(payload.token)}`
  }
  if (!returned.startsWith('/object/upload/sign/') || returned.includes('://') || returned.includes('..')) {
    throw new HttpError(502, 'The bill upload could not be started. Please try again.')
  }
  const absolute = `${url}/storage/v1${returned}`
  if (new URL(absolute).origin !== new URL(url).origin) {
    throw new HttpError(502, 'The bill upload could not be started. Please try again.')
  }
  return absolute
}

export async function downloadObject(objectPath: string): Promise<Uint8Array> {
  const response = await supabaseFetch(`/storage/v1/object/powergenie/${encodeObjectPath(objectPath)}`)
  if (!response.ok) {
    throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  }
  return new Uint8Array(await response.arrayBuffer())
}

export async function objectExists(objectPath: string): Promise<boolean> {
  const response = await supabaseFetch(`/storage/v1/object/powergenie/${encodeObjectPath(objectPath)}`, { method: 'GET' })
  return response.ok
}

export async function moveObject(fromPath: string, toPath: string): Promise<void> {
  const response = await supabaseFetch('/storage/v1/object/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bucketId: 'powergenie',
      sourceKey: fromPath,
      destinationKey: toPath,
    }),
  })
  if (response.ok) return
  if (await objectExists(toPath)) return
  console.error('supabase_move_failed', response.status)
  throw new HttpError(502, 'The bill could not be saved. Please try again.')
}

export async function deleteObject(objectPath: string): Promise<void> {
  await supabaseFetch('/storage/v1/object/powergenie', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: [objectPath] }),
  })
}

/** Confirmed one-hour calls from the public booking page. A missing table does not block the assistant. */
export async function confirmedAppointmentRanges(fromIso: string, toIso: string): Promise<Array<{ start: Date; end: Date }>> {
  let response: Response
  try {
    const params = new URLSearchParams()
    params.set('select', 'starts_at,ends_at')
    params.set('status', 'eq.confirmed')
    params.set('starts_at', `lt.${toIso}`)
    params.set('ends_at', `gt.${fromIso}`)
    params.set('limit', '500')
    response = await supabaseFetch(`/rest/v1/appointments?${params.toString()}`)
  } catch (error) {
    if (error instanceof HttpError && error.status === 503) return []
    throw error
  }
  if (!response.ok) return []
  const payload = await response.json()
  if (!Array.isArray(payload)) return []
  const rows = payload as Array<{ starts_at?: unknown; ends_at?: unknown }>
  const ranges: Array<{ start: Date; end: Date }> = []
  for (const row of rows) {
    if (typeof row.starts_at !== 'string' || typeof row.ends_at !== 'string') continue
    const start = new Date(row.starts_at)
    const end = new Date(row.ends_at)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue
    ranges.push({ start, end })
  }
  return ranges
}

export type DashboardProfile = {
  id: string;
  email: string;
  role: 'owner' | 'admin';
  display_name: string | null;
};

export function createAdmin(env: ServerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireDashboardUser(
  admin: SupabaseClient,
  token: string | null,
): Promise<{ profile: DashboardProfile } | { error: { status: number; message: string } }> {
  if (!token) {
    return { error: { status: 401, message: 'Sign in required.' } };
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { error: { status: 401, message: 'Sign in required.' } };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, display_name')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: { status: 403, message: 'This account is not invited to the dashboard.' } };
  }

  const row = profile as {
    id?: unknown;
    email?: unknown;
    role?: unknown;
    display_name?: unknown;
  };
  if (typeof row.id !== 'string' || typeof row.email !== 'string') {
    return { error: { status: 403, message: 'This account is not invited to the dashboard.' } };
  }
  if (row.role !== 'owner' && row.role !== 'admin') {
    return { error: { status: 403, message: 'This account is not invited to the dashboard.' } };
  }

  return {
    profile: {
      id: row.id,
      email: row.email,
      role: row.role,
      display_name: typeof row.display_name === 'string' ? row.display_name : null,
    },
  };
}
