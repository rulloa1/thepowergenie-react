// Google Calendar for website-assistant consults.
//
// The /book page syncs inside the Supabase `booking` edge function. This server
// is a different process, so it talks to Google and PostgREST directly with the
// same event shape (shared/calendar-sync). A missing calendar never fails the booking.

import { dashboardLeadUrl, siteOrigin } from '../supabase/functions/_shared/notify.js'
import {
  availabilityMembers,
  consultEventBody,
  fanOutCalendars,
  syncErrorMessage,
  type ConsultDetails,
  type MemberSyncResult,
  type StoredCalendarEvent,
} from '../supabase/functions/_shared/calendar-sync.js'
import { HttpError } from './http.js'
import { loadSlotRules } from './slot-rules.js'

type FetchImpl = typeof fetch

export type AssistantConsult = {
  id: string
  customerName: string
  phone: string
  email: string
  address: string
  notes: string
  appointmentDate: string
  durationMinutes: number
}

type Member = {
  userId: string
  role: 'owner' | 'admin'
  fullName: string | null
  calendarId: string
  email: string | null
  refreshToken: string
  requiredForAvailability: boolean
}

type GoogleEnv = {
  clientId: string
  clientSecret: string
  supabaseUrl: string
  supabaseKey: string
  siteUrl?: string
}

type Deps = { env?: NodeJS.ProcessEnv; fetchImpl?: FetchImpl }

const tokenCache = new Map<string, { token: string; exp: number }>()

function readEnv(env: NodeJS.ProcessEnv): GoogleEnv | null {
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim()
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim()
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const supabaseKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) return null
  return { clientId, clientSecret, supabaseUrl, supabaseKey, siteUrl: env.SITE_URL }
}

function missingRelation(status: number, body: unknown): boolean {
  if (!body || typeof body !== 'object') return status === 404
  const record = body as { code?: string; message?: string }
  if (record.code === '42P01' || record.code === 'PGRST205' || record.code === 'PGRST204') return true
  const message = (record.message || '').toLowerCase()
  return status === 404 || message.includes('does not exist') || message.includes('schema cache')
}

async function rest(env: GoogleEnv, fetchImpl: FetchImpl, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('apikey', env.supabaseKey)
  headers.set('user-agent', 'PowerGenieWebsite/1.0')
  headers.delete('authorization')
  const response = await fetchImpl(`${env.supabaseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(12_000) })
  const body = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, body }
}

function asRole(value: unknown): 'owner' | 'admin' {
  return value === 'admin' ? 'admin' : 'owner'
}

async function loadMembers(env: GoogleEnv, fetchImpl: FetchImpl): Promise<Member[]> {
  const profilesResponse = await rest(env, fetchImpl, '/rest/v1/hub_profiles?select=id,role,full_name')
  if (!profilesResponse.ok && !missingRelation(profilesResponse.status, profilesResponse.body)) {
    throw new HttpError(503, 'Scheduling is not available right now. Please try again.')
  }
  const profiles = Array.isArray(profilesResponse.body) ? profilesResponse.body as Array<Record<string, unknown>> : []
  const profileById = new Map(profiles.map(row => [String(row.id), row]))

  const accounts = await rest(
    env,
    fetchImpl,
    '/rest/v1/hub_google_accounts?select=user_id,google_email,calendar_id,refresh_token,required_for_availability,connected_at',
  )
  const members = new Map<string, Member>()
  if (accounts.ok && Array.isArray(accounts.body)) {
    for (const row of accounts.body as Array<Record<string, unknown>>) {
      if (typeof row.user_id !== 'string' || typeof row.refresh_token !== 'string') continue
      const profile = profileById.get(row.user_id)
      members.set(row.user_id, {
        userId: row.user_id,
        role: profile ? asRole(profile.role) : 'admin',
        fullName: typeof profile?.full_name === 'string' ? profile.full_name : null,
        calendarId: typeof row.calendar_id === 'string' && row.calendar_id ? row.calendar_id : 'primary',
        email: typeof row.google_email === 'string' ? row.google_email : null,
        refreshToken: row.refresh_token,
        requiredForAvailability: row.required_for_availability === true,
      })
    }
  } else if (!missingRelation(accounts.status, accounts.body)) {
    throw new HttpError(503, 'Scheduling is not available right now. Please try again.')
  }

  const legacy = await rest(
    env,
    fetchImpl,
    '/rest/v1/hub_google_credentials?select=connected_by,google_email,calendar_id,refresh_token&id=eq.1',
  )
  if (legacy.ok && Array.isArray(legacy.body) && legacy.body[0]) {
    const row = legacy.body[0] as Record<string, unknown>
    const userId = typeof row.connected_by === 'string' ? row.connected_by : ''
    if (userId && typeof row.refresh_token === 'string' && !members.has(userId)) {
      const profile = profileById.get(userId)
      members.set(userId, {
        userId,
        role: profile ? asRole(profile.role) : 'owner',
        fullName: typeof profile?.full_name === 'string' ? profile.full_name : null,
        calendarId: typeof row.calendar_id === 'string' && row.calendar_id ? row.calendar_id : 'primary',
        email: typeof row.google_email === 'string' ? row.google_email : null,
        refreshToken: row.refresh_token,
        requiredForAvailability: false,
      })
    }
  }
  return [...members.values()]
}

async function accessToken(env: GoogleEnv, fetchImpl: FetchImpl, refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken)
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    signal: AbortSignal.timeout(12_000),
  })
  const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string; expires_in?: number }
  if (!response.ok || !data.access_token) {
    throw new HttpError(502, `token refresh failed: ${data.error || response.status}`)
  }
  tokenCache.set(refreshToken, { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3000) * 1000 })
  return data.access_token
}

async function calendarFetch(env: GoogleEnv, fetchImpl: FetchImpl, member: Member, path: string, init: RequestInit = {}) {
  const token = await accessToken(env, fetchImpl, member.refreshToken)
  return fetchImpl(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(12_000),
  })
}

async function freeBusy(env: GoogleEnv, fetchImpl: FetchImpl, member: Member, timeMin: string, timeMax: string, timeZone: string) {
  const response = await calendarFetch(env, fetchImpl, member, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({ timeMin, timeMax, timeZone, items: [{ id: member.calendarId }] }),
  })
  const data = await response.json().catch(() => ({})) as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }
  if (!response.ok) throw new HttpError(503, 'Scheduling is not available right now. Please try again.')
  const calendar = data.calendars?.[member.calendarId]
  if (!calendar || (calendar.errors && calendar.errors.length)) {
    throw new HttpError(503, 'Scheduling is not available right now. Please try again.')
  }
  return calendar.busy ?? []
}

function consultDetails(consult: AssistantConsult, env: GoogleEnv): ConsultDetails {
  const startMs = Date.parse(consult.appointmentDate)
  const noteLine = consult.notes.split('\n').find(line => line.startsWith('Preferred windows: '))
  return {
    id: consult.id,
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + consult.durationMinutes * 60_000).toISOString(),
    customerName: consult.customerName,
    phone: consult.phone,
    email: consult.email,
    address: consult.address,
    note: noteLine ? noteLine.slice('Preferred windows: '.length) : null,
    dashboardUrl: dashboardLeadUrl(siteOrigin(env.siteUrl), consult.id),
    source: 'assistant',
    hasLightBill: consult.notes.includes('Bill: attached'),
  }
}

async function placeEvent(env: GoogleEnv, fetchImpl: FetchImpl, member: Member, details: ConsultDetails): Promise<string> {
  const params = new URLSearchParams({
    privateExtendedProperty: `powerGenieAppointmentId=${details.id}`,
    maxResults: '1',
    singleEvents: 'true',
  })
  const found = await calendarFetch(
    env,
    fetchImpl,
    member,
    `/calendars/${encodeURIComponent(member.calendarId)}/events?${params}`,
  )
  const foundBody = await found.json().catch(() => ({})) as { items?: Array<{ id?: string }> }
  const existing = found.ok ? foundBody.items?.[0]?.id : undefined
  const path = existing
    ? `/calendars/${encodeURIComponent(member.calendarId)}/events/${encodeURIComponent(existing)}`
    : `/calendars/${encodeURIComponent(member.calendarId)}/events`
  const response = await calendarFetch(env, fetchImpl, member, path, {
    method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify(consultEventBody(details)),
  })
  const data = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!response.ok || !data.id) {
    throw new HttpError(response.status || 502, `event create failed: ${response.status} ${data.error?.message || ''}`.trim())
  }
  return data.id
}

async function loadStored(env: GoogleEnv, fetchImpl: FetchImpl, customerId: string): Promise<StoredCalendarEvent[] | null> {
  const response = await rest(
    env,
    fetchImpl,
    `/rest/v1/hub_calendar_events?select=user_id,google_event_id,sync_error&customer_id=eq.${encodeURIComponent(customerId)}`,
  )
  if (missingRelation(response.status, response.body)) return null
  if (!response.ok || !Array.isArray(response.body)) {
    throw new HttpError(502, 'Could not read calendar sync rows.')
  }
  return (response.body as Array<Record<string, unknown>>).map(row => ({
    userId: String(row.user_id),
    googleEventId: typeof row.google_event_id === 'string' ? row.google_event_id : null,
    syncError: typeof row.sync_error === 'string' ? row.sync_error : null,
  }))
}

async function saveStored(env: GoogleEnv, fetchImpl: FetchImpl, customerId: string, results: MemberSyncResult[]) {
  for (const result of results) {
    const existing = await rest(
      env,
      fetchImpl,
      `/rest/v1/hub_calendar_events?select=id&customer_id=eq.${encodeURIComponent(customerId)}&user_id=eq.${encodeURIComponent(result.userId)}`,
    )
    const row = {
      appointment_id: null,
      customer_id: customerId,
      user_id: result.userId,
      google_event_id: result.googleEventId,
      sync_error: result.syncError,
      updated_at: new Date().toISOString(),
    }
    const current = Array.isArray(existing.body) ? (existing.body as Array<{ id?: string }>)[0] : undefined
    const saved = current?.id
      ? await rest(env, fetchImpl, `/rest/v1/hub_calendar_events?id=eq.${encodeURIComponent(current.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
          body: JSON.stringify(row),
        })
      : await rest(env, fetchImpl, '/rest/v1/hub_calendar_events', {
          method: 'POST',
          headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
          body: JSON.stringify(row),
        })
    if (!saved.ok) throw new HttpError(502, 'Could not save a Google event id.')
  }
}

/** Busy time on Horace's calendar, plus any member marked required. Empty when Google is off. */
export async function assistantAvailabilityBusy(timeMin: string, timeMax: string, deps: Deps = {}): Promise<{ start: string; end: string }[]> {
  const env = readEnv(deps.env ?? process.env)
  if (!env) return []
  const fetchImpl = deps.fetchImpl ?? fetch
  const required = availabilityMembers(await loadMembers(env, fetchImpl))
  if (!required.length) return []
  const timeZone = loadSlotRules(deps.env ?? process.env).timeZone
  const lists = await Promise.all(required.map(member => freeBusy(env, fetchImpl, member, timeMin, timeMax, timeZone)))
  return lists.flat()
}

/** Create or update one event per connected member. Never throws. */
export async function syncAssistantConsult(consult: AssistantConsult, deps: Deps = {}): Promise<void> {
  try {
    const env = readEnv(deps.env ?? process.env)
    if (!env) return
    const fetchImpl = deps.fetchImpl ?? fetch
    const members = await loadMembers(env, fetchImpl)
    if (!members.length) return
    const stored = await loadStored(env, fetchImpl, consult.id)
    if (!stored) {
      console.error('[calendar] hub_calendar_events is missing; apply the member calendar migration')
      return
    }
    const details = consultDetails(consult, env)
    const results = await fanOutCalendars({
      members,
      stored,
      createEvent: member => placeEvent(env, fetchImpl, member, details),
      updateEvent: async (member, eventId) => {
        const response = await calendarFetch(
          env,
          fetchImpl,
          member,
          `/calendars/${encodeURIComponent(member.calendarId)}/events/${encodeURIComponent(eventId)}`,
          { method: 'PATCH', body: JSON.stringify(consultEventBody(details)) },
        )
        await response.json().catch(() => null)
        if (response.status === 404 || response.status === 410) throw new HttpError(response.status, 'event missing')
        if (!response.ok) throw new HttpError(response.status, `event update failed: ${response.status}`)
      },
    })
    for (const result of results) {
      if (result.syncError) console.error('[calendar]', consult.id, result.userId, result.syncError)
    }
    await saveStored(env, fetchImpl, consult.id, results)
  } catch (error) {
    console.error('[calendar] assistant', syncErrorMessage(error))
  }
}
