import { createHash, timingSafeEqual } from 'node:crypto'
import { HttpError } from './http.js'

/**
 * Talks to PostgREST and Storage with fetch.
 *
 * The project's secret key is `sb_secret_...`, which is not a JWT. A legacy
 * service_role JWT is also accepted. The assistant sends either key on the
 * `apikey` header only. Putting it on `Authorization: Bearer` makes Supabase
 * try to verify `sb_secret_` as a JWT and reject the call, so these helpers
 * use fetch.
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

/**
 * Project URL only. A placeholder, a quoted value, or a path pasted after the
 * host used to reach fetch() and throw TypeError: Failed to parse URL.
 */
/** Loopback and the reserved .test domain. The integration tests speak plain HTTP to those hosts only. */
function localTestHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.test')
}

export function supabaseProjectUrl(value: string): string {
  const trimmed = value.trim().replace(/^['"]+|['"]+$/g, '').replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new HttpError(503, 'The dashboard database address is not a valid https URL. Set it to https://<project>.supabase.co and redeploy.')
  }
  const httpsProject = parsed.protocol === 'https:' && parsed.hostname.includes('.')
  if (httpsProject || (parsed.protocol === 'http:' && localTestHost(parsed.hostname))) {
    return parsed.origin
  }
  throw new HttpError(503, 'The dashboard database address is not a valid https URL. Set it to https://<project>.supabase.co and redeploy.')
}

export function supabaseConfig(): { url: string; key: string } {
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const accepted =
    key.startsWith('sb_secret_') ||
    process.env.ASSISTANT_ALLOW_LEGACY_KEY === '1' ||
    isServiceRoleJwt(key)
  if (!rawUrl.trim() || !key || !accepted) {
    throw new HttpError(503, 'Scheduling is not configured yet. Please call Horace and we will set this up.')
  }
  return { url: supabaseProjectUrl(rawUrl), key }
}

/** Node fetch throws TypeError for a bad URL and for "fetch failed". Neither is an HttpError, so the route logged only "TypeError". */
export async function supabaseRequest(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'fetch failed'
    console.error('supabase_fetch_failed', error instanceof Error ? error.name : 'unknown', detail.slice(0, 180).replace(/https?:\/\/\S+/g, '[url]'))
    throw new HttpError(503, 'The dashboard could not reach Supabase. Check that the project URL is https://<project>.supabase.co and redeploy.')
  }
}

export async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = supabaseConfig()
  const headers = new Headers()
  headers.set('apikey', key)
  if (isServiceRoleJwt(key)) {
    headers.set('authorization', `Bearer ${key}`)
  }
  headers.set('user-agent', 'PowerGenieWebsite/1.0')
  if (init.headers) {
    new Headers(init.headers).forEach((value, name) => {
      const lower = name.toLowerCase()
      if (lower === 'authorization' || lower === 'apikey' || lower === 'cookie' || lower === 'user-agent') return
      headers.set(name, value)
    })
  }
  return supabaseRequest(`${url}${path}`, { ...init, headers })
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

export type BusyInterval = { start: string; end: string }

/** Booked Referral Hub appointments that overlap [fromIso, toIso). Throws when the read fails. */
export async function hubBusyIntervals(fromIso: string, toIso: string): Promise<BusyInterval[]> {
  const params = new URLSearchParams()
  params.set('select', 'starts_at,ends_at')
  params.set('status', 'eq.booked')
  params.set('starts_at', `lt.${toIso}`)
  params.set('ends_at', `gt.${fromIso}`)
  params.set('limit', '500')
  const response = await supabaseFetch(`/rest/v1/hub_appointments?${params.toString()}`)
  if (!response.ok) {
    console.error('supabase_hub_slots_failed', response.status)
    throw new HttpError(503, 'Scheduling is not available right now. Please try again.')
  }
  const rows = (await response.json()) as Array<{ starts_at?: string; ends_at?: string }>
  const busy: BusyInterval[] = []
  for (const row of rows) {
    if (typeof row.starts_at === 'string' && typeof row.ends_at === 'string') {
      busy.push({ start: row.starts_at, end: row.ends_at })
    }
  }
  return busy
}

/**
 * Constant-time string compare. Digests are fixed length, so this stays
 * constant-time when the shared secret and the service-role key differ in length.
 * Empty values never match, including an empty token against an unset secret.
 */
function secretEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const left = createHash('sha256').update(provided, 'utf8').digest()
  const right = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(left, right)
}

/**
 * True when Authorization carries a secret this server was configured with.
 * Used by the booking function's bill read (`POST /api/assistant?route=extract`).
 *
 * Supabase injects SUPABASE_SERVICE_ROLE_KEY into Edge Functions and refuses
 * secrets whose names start with SUPABASE_, so the function's key is often not
 * the `sb_secret_` value set on Vercel. EXTRACT_SHARED_SECRET is the shared
 * value both sides can set. The service-role key remains a fallback for
 * environments where those two keys really are the same.
 *
 * A missing or unknown token is rejected. The route is never anonymous.
 */
export function serviceBearerAuthorized(request: Request): boolean {
  const header = request.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const shared = (process.env.EXTRACT_SHARED_SECRET || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return secretEqual(token, shared) || secretEqual(token, service)
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
