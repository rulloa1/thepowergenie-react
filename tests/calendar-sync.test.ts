import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  availabilityMembers,
  consultEventBody,
  fanOutCalendars,
  removeCalendars,
  type ConsultDetails,
} from '../supabase/functions/_shared/calendar-sync.js'
import { assistantAvailabilityBusy, syncAssistantConsult, type AssistantConsult } from '../server/google-calendar.js'
import { saveLead } from '../server/lead.js'
import { loadSlotRules } from '../server/slot-rules.js'
import { listSlots } from '../server/slots.js'
import { SLOT_TIME_ZONE } from '../supabase/functions/_shared/slots.js'
import { startMockSupabase } from './mock-supabase.js'

const HORACE = '11111111-1111-4111-8111-111111111111'
const RORY = '22222222-2222-4222-8222-222222222222'

const details: ConsultDetails = {
  id: '44444444-4444-4444-8444-444444444444',
  start: '2026-10-27T15:00:00.000Z',
  end: '2026-10-27T17:00:00.000Z',
  customerName: 'Alex Morgan',
  phone: '(713) 555-0100',
  email: 'alex@example.com',
  address: '456 Oak Lane, Houston, TX 77008',
  note: 'weekday mornings',
  dashboardUrl: 'https://thepowergenie.theroyeffect.com/dashboard?tab=leads&id=44444444-4444-4444-8444-444444444444',
  source: 'assistant',
  hasLightBill: true,
}

test('calendar events name the consult, stay in Central time, and link the lead', () => {
  const body = consultEventBody(details)
  assert.equal(body.summary, 'Power Genie consult: Alex Morgan')
  assert.equal(body.start.timeZone, SLOT_TIME_ZONE)
  assert.equal(body.end.timeZone, SLOT_TIME_ZONE)
  assert.equal(body.start.dateTime, details.start)
  assert.equal(body.end.dateTime, details.end)
  assert.match(body.description, /Phone: \(713\) 555-0100/)
  assert.match(body.description, /Email: alex@example.com/)
  assert.match(body.description, /Address: 456 Oak Lane/)
  assert.match(body.description, /Note: weekday mornings/)
  assert.match(body.description, /dashboard\?tab=leads&id=44444444/)
  assert.doesNotMatch(body.description, /storage|signedUrl|public link/i)
  assert.equal(body.extendedProperties.private.powerGenieAppointmentId, details.id)
})

test('availability uses Horace and any member marked required', () => {
  const members = [
    { userId: HORACE, role: 'owner', requiredForAvailability: false },
    { userId: RORY, role: 'admin', requiredForAvailability: false },
    { userId: '33333333-3333-4333-8333-333333333333', role: 'admin', requiredForAvailability: true },
  ]
  const chosen = availabilityMembers(members).map(member => member.userId)
  assert.deepEqual(chosen, [HORACE, '33333333-3333-4333-8333-333333333333'])
})

test('fan-out creates every calendar, updates a stored id, and keeps going after one failure', async () => {
  const created: string[] = []
  const updated: string[] = []
  const results = await fanOutCalendars({
    members: [{ userId: HORACE }, { userId: RORY }],
    stored: [{ userId: HORACE, googleEventId: 'evt-h', syncError: null }],
    createEvent: async member => {
      created.push(member.userId)
      if (member.userId === RORY) throw new Error('Rory calendar rejected the event')
      return `new-${member.userId}`
    },
    updateEvent: async (member, eventId) => {
      updated.push(`${member.userId}:${eventId}`)
    },
  })
  assert.deepEqual(updated, [`${HORACE}:evt-h`])
  assert.deepEqual(created, [RORY])
  assert.equal(results.find(row => row.userId === HORACE)?.googleEventId, 'evt-h')
  assert.equal(results.find(row => row.userId === HORACE)?.syncError, null)
  assert.equal(results.find(row => row.userId === RORY)?.googleEventId, null)
  assert.match(results.find(row => row.userId === RORY)?.syncError || '', /Rory calendar/)
})

test('a deleted phone event is created again, and cancel deletes every stored id', async () => {
  const created: string[] = []
  const results = await fanOutCalendars({
    members: [{ userId: HORACE }],
    stored: [{ userId: HORACE, googleEventId: 'gone', syncError: null }],
    createEvent: async () => {
      created.push('again')
      return 'evt-new'
    },
    updateEvent: async () => {
      const error = new Error('missing') as Error & { status: number }
      error.status = 404
      throw error
    },
  })
  assert.deepEqual(created, ['again'])
  assert.equal(results[0].googleEventId, 'evt-new')

  const deleted: string[] = []
  const removed = await removeCalendars({
    members: [{ userId: HORACE }],
    stored: [
      { userId: HORACE, googleEventId: 'evt-h', syncError: null },
      { userId: RORY, googleEventId: 'evt-r', syncError: null },
    ],
    deleteEvent: async (member, eventId) => {
      deleted.push(`${member.userId}:${eventId}`)
    },
  })
  assert.deepEqual(deleted, [`${HORACE}:evt-h`])
  assert.equal(removed.find(row => row.userId === RORY)?.error?.includes('disconnected'), true)
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('assistant sync writes one event per member and does not fail the others', async () => {
  const saved: unknown[] = []
  const consult: AssistantConsult = {
    id: details.id,
    customerName: details.customerName,
    phone: details.phone || '',
    email: details.email || '',
    address: details.address || '',
    notes: 'Website assistant lead\nPreferred windows: weekday mornings\nBill: attached',
    appointmentDate: '2026-10-27T10:00:00-05:00',
    durationMinutes: 120,
  }
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method || 'GET'
    const body = typeof init?.body === 'string' ? init.body : ''
    if (url.includes('/hub_profiles')) {
      return jsonResponse([
        { id: HORACE, role: 'owner', full_name: 'Horace Lawrence' },
        { id: RORY, role: 'admin', full_name: 'Rory Ulloa' },
      ])
    }
    if (url.includes('/hub_google_accounts')) {
      return jsonResponse([
        { user_id: HORACE, google_email: 'horace@example.com', calendar_id: 'primary', refresh_token: 'rt-horace', required_for_availability: false },
        { user_id: RORY, google_email: 'rory@example.com', calendar_id: 'primary', refresh_token: 'rt-rory', required_for_availability: true },
      ])
    }
    if (url.includes('/hub_google_credentials')) return jsonResponse([])
    if (url.includes('/hub_calendar_events') && method === 'GET') return jsonResponse([])
    if (url.includes('/hub_calendar_events') && method === 'POST') {
      saved.push(JSON.parse(body))
      return new Response(null, { status: 201 })
    }
    if (url.includes('oauth2.googleapis.com/token')) {
      const refresh = new URLSearchParams(body).get('refresh_token')
      return jsonResponse({ access_token: `token-${refresh}`, expires_in: 3600 })
    }
    if (url.includes('/events?') && method === 'GET') return jsonResponse({ items: [] })
    if (url.includes('/calendar/v3/calendars/') && method === 'POST') {
      const auth = new Headers(init?.headers).get('authorization') || ''
      if (auth.includes('rt-rory')) return jsonResponse({ error: { message: 'forbidden' } }, 403)
      const payload = JSON.parse(body) as { summary: string; start: { timeZone: string }; end: { dateTime: string }; description: string }
      assert.equal(payload.summary, 'Power Genie consult: Alex Morgan')
      assert.equal(payload.start.timeZone, 'America/Chicago')
      assert.equal(payload.end.dateTime, '2026-10-27T17:00:00.000Z')
      assert.match(payload.description, /weekday mornings/)
      assert.match(payload.description, /tab=leads&id=44444444/)
      return jsonResponse({ id: 'evt-horace' })
    }
    return jsonResponse({ error: `unexpected ${method} ${url}` }, 500)
  }

  await syncAssistantConsult(consult, {
    env: {
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_only',
      SITE_URL: 'https://thepowergenie.theroyeffect.com',
    },
    fetchImpl,
  })

  assert.equal(saved.length, 2)
  const horace = saved.find(row => (row as { user_id: string }).user_id === HORACE) as { google_event_id: string; sync_error: string | null }
  const rory = saved.find(row => (row as { user_id: string }).user_id === RORY) as { google_event_id: string | null; sync_error: string | null }
  assert.equal(horace.google_event_id, 'evt-horace')
  assert.equal(horace.sync_error, null)
  assert.equal(rory.google_event_id, null)
  assert.match(rory.sync_error || '', /403/)
})

test('free/busy for open times asks Horace and required members only', async () => {
  const asked: string[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const body = typeof init?.body === 'string' ? init.body : ''
    if (url.includes('/hub_profiles')) {
      return jsonResponse([
        { id: HORACE, role: 'owner', full_name: 'Horace Lawrence' },
        { id: RORY, role: 'admin', full_name: 'Rory Ulloa' },
      ])
    }
    if (url.includes('/hub_google_accounts')) {
      return jsonResponse([
        { user_id: HORACE, refresh_token: 'rt-horace', calendar_id: 'primary', required_for_availability: false },
        { user_id: RORY, refresh_token: 'rt-rory', calendar_id: 'primary', required_for_availability: false },
      ])
    }
    if (url.includes('/hub_google_credentials')) return jsonResponse([])
    if (url.includes('oauth2.googleapis.com/token')) {
      const refresh = new URLSearchParams(body).get('refresh_token')
      return jsonResponse({ access_token: `token-${refresh}`, expires_in: 3600 })
    }
    if (url.endsWith('/freeBusy')) {
      const auth = new Headers(init?.headers).get('authorization') || ''
      asked.push(auth)
      return jsonResponse({ calendars: { primary: { busy: auth.includes('rt-horace') ? [{ start: '2026-10-27T15:00:00Z', end: '2026-10-27T16:00:00Z' }] : [] } } })
    }
    return jsonResponse({ error: url }, 500)
  }
  const busy = await assistantAvailabilityBusy('2026-10-27T14:00:00Z', '2026-10-27T18:00:00Z', {
    env: {
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_only',
    },
    fetchImpl,
  })
  assert.equal(asked.length, 1)
  assert.match(asked[0], /rt-horace/)
  assert.equal(busy.length, 1)
})

test('a booking still saves when Google tables are not there yet', async () => {
  const mock = await startMockSupabase()
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    SITE_URL: process.env.SITE_URL,
  }
  process.env.SUPABASE_URL = mock.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_only'
  process.env.GOOGLE_CLIENT_ID = 'client'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.SITE_URL = 'https://thepowergenie.theroyeffect.com'
  try {
    const slot = listSlots(loadSlotRules(), new Date(), new Set())[0]
    const confirmation = await saveLead({
      clientRequestId: '88888888-8888-4888-8888-888888888888',
      consent: true,
      name: 'Alex Morgan',
      phone: '7135550102',
      email: 'alex3@example.com',
      serviceAddress: '456 Oak Lane, Houston, TX 77008',
      utility: 'Entergy Texas',
      preferredWindows: 'weekday mornings',
      slotStart: slot.start,
    })
    assert.notEqual(confirmation, 'honeypot')
    if (confirmation === 'honeypot') return
    assert.equal(confirmation.name, 'Alex Morgan')
    assert.equal(mock.customers.length, 1)
    assert.equal(mock.customers[0].appointment_date, slot.start)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await mock.close()
  }
})

test('the schedule tab still tells the owner to add Supabase OAuth secrets', () => {
  const source = readFileSync('src/hub/ScheduleTab.tsx', 'utf8')
  assert.match(source, /Google Calendar isn't configured yet\. Add the Google OAuth secrets on the Supabase project to turn on phone sync\./)
  assert.match(source, /Connect Google Calendar/)
})
