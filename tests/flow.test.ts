import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { handleApi } from '../server/routes'
import { resetRateLimits } from '../server/rate-limit'
import { startMockSupabase, type MockSupabase } from './mock-supabase'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let mock: MockSupabase
const original = { ...process.env }

before(async () => {
  mock = await startMockSupabase()
  process.env.SUPABASE_URL = mock.url
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_only'
  process.env.ASSISTANT_MOCK_AI = '1'
  resetRateLimits()
})

after(async () => {
  process.env = { ...original }
  await mock.close()
})

function api(path: string, init: RequestInit = {}, ip = '203.0.113.40') {
  const headers = new Headers(init.headers)
  headers.set('origin', 'http://127.0.0.1:3000')
  headers.set('x-forwarded-for', ip)
  return handleApi(new Request(`http://127.0.0.1:3000${path}`, { ...init, headers }))
}

test('upload, confirm, and book against the mocked hub', async () => {
  const upload = await api('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'bill.png', mimeType: 'image/png', sizeBytes: png.length }),
  })
  assert.equal(upload.status, 200)
  const started = await upload.json() as { signedUrl: string; receipt: string }
  assert.match(started.signedUrl, /^http:\/\/127\.0\.0\.1:\d+\/storage\/v1\/object\/upload\/sign\//)

  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', new Blob([png], { type: 'image/png' }), 'bill.png')
  const put = await fetch(started.signedUrl, { method: 'PUT', body: form })
  assert.equal(put.status, 200, await put.clone().text())

  const bill = await api('/api/bill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ receipt: started.receipt }),
  })
  assert.equal(bill.status, 200, await bill.clone().text())
  const read = await bill.json() as { fields: { customerName: string; utility: string; kwhThisPeriod: number } }
  assert.equal(read.fields.customerName, 'Alex Morgan')
  assert.equal(read.fields.utility, 'Entergy Texas')
  assert.equal(read.fields.kwhThisPeriod, 1100)

  const slotsResponse = await api('/api/slots')
  assert.equal(slotsResponse.status, 200)
  const { slots } = await slotsResponse.json() as { slots: Array<{ start: string; label: string }> }
  assert.ok(slots.length > 0)

  const payload = {
    clientRequestId: '44444444-4444-4444-8444-444444444444',
    consent: true,
    name: 'Alex Morgan',
    phone: '(713) 555-0100',
    email: 'alex@example.com',
    serviceAddress: '456 Oak Lane, Houston, TX 77008',
    utility: 'Entergy Texas',
    preferredWindows: 'weekday mornings',
    slotStart: slots[0].start,
    receipt: started.receipt,
    bill: read.fields,
  }
  const lead = await api('/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert.equal(lead.status, 200, await lead.clone().text())
  const saved = await lead.json() as { confirmation: { slotLabel: string; billAttached: boolean; name: string } }
  assert.equal(saved.confirmation.name, 'Alex Morgan')
  assert.equal(saved.confirmation.billAttached, true)
  assert.equal(saved.confirmation.slotLabel, slots[0].label)

  const again = await api('/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  assert.equal(again.status, 200, await again.clone().text())
  assert.equal(mock.customers.length, 1)
  assert.equal(mock.files.length, 1)
  assert.equal(mock.activity.length, 1)

  const customer = mock.customers[0]
  assert.equal(customer.stage, 'bill_received')
  assert.equal(customer.acknowledged, 0)
  assert.equal(customer.next_step, 'Horace: run savings calc')
  assert.equal(customer.appointment_date, slots[0].start)
  assert.match(String(customer.notes), /TCPA consent: yes/)
  assert.doesNotMatch(String(customer.notes), /transcript/)
  assert.equal(mock.files[0].category, 'light_bill')
  assert.equal(mock.files[0].storage_path, mock.files[0].storage_path)
  assert.match(String(mock.files[0].storage_path), /^customers\/44444444-4444-4444-8444-444444444444\/light_bill\//)
  assert.equal(mock.files[0].size_bytes, png.length)
  assert.equal(customer.esiid, '10443720012345678')
  assert.equal(customer.meter_number, 'A12345678')
  assert.equal(customer.phone, '(713) 555-0100')
  assert.equal(Array.isArray(customer.usage_history) ? customer.usage_history.length : 0, 6)
  assert.match(String(mock.activity[0].message), /website assistant/i)

  const serverCalls = mock.calls.filter(call => call.headers['user-agent'] === 'PowerGenieWebsite/1.0')
  assert.ok(serverCalls.length >= 4)
  for (const call of serverCalls) {
    assert.equal(call.headers.authorization, undefined)
    assert.equal(call.headers.apikey, 'sb_secret_test_only')
  }
})

test('booking without consent or with a honeypot does not write a lead', async () => {
  const beforeCount = mock.customers.length
  const refused = await api('/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ consent: false, clientRequestId: '55555555-5555-4555-8555-555555555555' }),
  }, '203.0.113.41')
  assert.equal(refused.status, 400)
  const bot = await api('/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pg_leave_blank: 'http://spam.example',
      consent: true,
      clientRequestId: '66666666-6666-4666-8666-666666666666',
      name: 'Bot',
      phone: '7135550199',
      email: 'bot@example.com',
      serviceAddress: '1 Spam St, Houston, TX',
      utility: 'Entergy',
      slotStart: '2026-10-23T09:00:00-05:00',
    }),
  }, '203.0.113.42')
  assert.equal(bot.status, 200)
  assert.equal(mock.customers.length, beforeCount)
})

test('a hub appointment hides the overlapping assistant slot', async () => {
  const first = await api('/api/slots', {}, '203.0.113.60')
  assert.equal(first.status, 200)
  const { slots } = await first.json() as { slots: Array<{ start: string }> }
  const target = slots[0]
  const start = new Date(target.start).getTime()
  mock.hubBusy.push({
    starts_at: new Date(start + 30 * 60 * 1000).toISOString(),
    ends_at: new Date(start + 90 * 60 * 1000).toISOString(),
  })
  try {
    const second = await api('/api/slots', {}, '203.0.113.61')
    const open = await second.json() as { slots: Array<{ start: string }> }
    assert.equal(open.slots.some(slot => slot.start === target.start), false)
    const refused = await api('/api/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: '77777777-7777-4777-8777-777777777777',
        consent: true,
        name: 'Alex Morgan',
        phone: '7135550101',
        email: 'alex2@example.com',
        serviceAddress: '456 Oak Lane, Houston, TX 77008',
        utility: 'Entergy Texas',
        slotStart: target.start,
      }),
    }, '203.0.113.62')
    assert.equal(refused.status, 409, await refused.clone().text())
  } finally {
    mock.hubBusy.length = 0
  }
})

test('the booking extractor requires the service key and returns the bill', async () => {
  const upload = await api('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'bill.png', mimeType: 'image/png', sizeBytes: png.length }),
  }, '203.0.113.63')
  const started = await upload.json() as { signedUrl: string }
  const form = new FormData()
  form.append('', new Blob([png], { type: 'image/png' }), 'bill.png')
  assert.equal((await fetch(started.signedUrl, { method: 'PUT', body: form })).status, 200)
  const marker = '/object/upload/sign/powergenie/'
  const path = decodeURIComponent(new URL(started.signedUrl).pathname.slice(new URL(started.signedUrl).pathname.indexOf(marker) + marker.length))

  const denied = await api('/api/assistant?route=extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  }, '203.0.113.64')
  assert.equal(denied.status, 401)

  const read = await api('/api/assistant?route=extract', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer sb_secret_test_only',
    },
    body: JSON.stringify({ path }),
  }, '203.0.113.65')
  assert.equal(read.status, 200, await read.clone().text())
  const fields = await read.json() as { fields: { esiid: string; kwhThisPeriod: number } }
  assert.equal(fields.fields.esiid, '10443720012345678')
  assert.equal(fields.fields.kwhThisPeriod, 1100)

  const gone = await api('/api/assistant?route=extract', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer sb_secret_test_only',
    },
    body: JSON.stringify({ path }),
  }, '203.0.113.66')
  assert.equal(gone.status, 400)
})

test('extract accepts EXTRACT_SHARED_SECRET and still accepts the service key', async () => {
  process.env.EXTRACT_SHARED_SECRET = 'shared-extract-secret-value'
  const uploadBill = async (ip: string) => {
    const upload = await api('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'bill.png', mimeType: 'image/png', sizeBytes: png.length }),
    }, ip)
    assert.equal(upload.status, 200, await upload.clone().text())
    const started = await upload.json() as { signedUrl: string }
    const form = new FormData()
    form.append('', new Blob([png], { type: 'image/png' }), 'bill.png')
    assert.equal((await fetch(started.signedUrl, { method: 'PUT', body: form })).status, 200)
    const marker = '/object/upload/sign/powergenie/'
    const pathname = new URL(started.signedUrl).pathname
    return decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length))
  }
  const extract = (path: string, authorization: string | null, ip: string) => {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (authorization) headers.set('authorization', authorization)
    return api('/api/assistant?route=extract', {
      method: 'POST',
      headers,
      body: JSON.stringify({ path }),
    }, ip)
  }
  try {
    const path = await uploadBill('203.0.113.70')
    assert.equal((await extract(path, null, '203.0.113.71')).status, 401)
    assert.equal((await extract(path, 'Bearer x', '203.0.113.72')).status, 401)
    assert.equal((await extract(path, 'Bearer sb_secret_test_only_extra', '203.0.113.73')).status, 401)

    const shared = await extract(path, 'Bearer shared-extract-secret-value', '203.0.113.74')
    assert.equal(shared.status, 200, await shared.clone().text())
    const sharedFields = await shared.json() as { fields: { esiid: string } }
    assert.equal(sharedFields.fields.esiid, '10443720012345678')

    const again = await uploadBill('203.0.113.75')
    const viaService = await extract(again, 'Bearer sb_secret_test_only', '203.0.113.76')
    assert.equal(viaService.status, 200, await viaService.clone().text())
    assert.equal((await extract(again, null, '203.0.113.77')).status, 401)
  } finally {
    delete process.env.EXTRACT_SHARED_SECRET
  }
})

test('cross-origin and oversized bill requests are rejected', async () => {
  const blocked = await handleApi(new Request('http://127.0.0.1:3000/api/slots', {
    headers: { origin: 'https://evil.example', host: '127.0.0.1:3000', 'x-forwarded-for': '203.0.113.43' },
  }))
  assert.equal(blocked.status, 403)
  const huge = await api('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName: 'bill.pdf', mimeType: 'application/pdf', sizeBytes: 11 * 1024 * 1024 }),
  }, '203.0.113.44')
  assert.equal(huge.status, 413)
})
