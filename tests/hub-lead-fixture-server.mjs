/**
 * Local stand-in for the Referral Hub tables the Leads tab talks to.
 * It is not the production database. It checks the same rules the migration
 * asks Postgres to enforce: a signed-in hub member, manual created_by on
 * insert, no hard delete, and archive columns instead of removing the row.
 *
 *   node tests/hub-lead-fixture-server.mjs
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.HUB_FIXTURE_PORT || 54321)
const MEMBERS = {
  '11111111-1111-4111-8111-111111111111': {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'horace.lawrence@sunrun.com',
    full_name: 'Horace Lawrence',
    role: 'owner',
    password: 'hub-test-pass',
  },
  '22222222-2222-4222-8222-222222222222': {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'roryulloa@gmail.com',
    full_name: 'Rory Ulloa',
    role: 'admin',
    password: 'hub-test-pass',
  },
}
const STAGES = new Set(['bill_received', 'savings_calc', 'panel_design', 'proposal_ready', 'presented', 'signed', 'site_survey', 'permits', 'installed', 'lost'])
const PROTECTED = new Set(['id', 'created_at', 'created_by', 'logged_on', 'appointment_date', 'date_sent_to_horace', 'acknowledged'])
const BILL_PATH = /^customers\/[A-Za-z0-9_-]{1,80}\/light_bill\/[A-Za-z0-9._-]{1,160}$/

const customers = [
  {
    id: 'gmail-demo-1',
    created_at: '2026-10-24T04:21:31.659Z',
    logged_on: '2026-10-23',
    created_by: null,
    customer_name: 'Inbox Neighbor',
    service_address: '10 Grid Lane, Houston, TX 77008',
    utility: 'Entergy Texas',
    account_number: 'ACC-100200',
    phone: '713-555-0100',
    email: 'inbox.neighbor@example.com',
    esiid: '10443720000000001',
    meter_number: 'MTR-100',
    tdu: 'CenterPoint Energy',
    rep_puct_certificate: null,
    bill_date: '2026-09-20',
    rate_plan: null,
    kwh_this_period: 900,
    days: 30,
    avg_kwh_per_day: 30,
    kwh_same_month_last_year: 800,
    current_charges: 140,
    total_due: 140,
    past_due: 0,
    est_cents_per_kwh: 15.5,
    avg_monthly_kwh: 850,
    usage_history: [
      { month: '2026-07', kwh: 1100 },
      { month: '2026-08', kwh: 980 },
      { month: '2026-09', kwh: 900 },
    ],
    notes: 'Gmail message 18abcdef123\nForwarded light bill',
    stage: 'bill_received',
    date_sent_to_horace: '2026-10-23',
    appointment_date: null,
    updated_at: '2026-10-24T04:21:31.659Z',
    acknowledged: 0,
    archived_at: null,
    archived_by: null,
  },
]
const files = [
  {
    id: 'gmail-bill-1',
    customer_id: 'gmail-demo-1',
    uploaded_by: null,
    uploader_name: 'Gmail',
    category: 'light_bill',
    file_name: 'inbox-bill.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1200,
    storage_path: 'customers/gmail-demo-1/light_bill/gmail-bill-1-inbox-bill.pdf',
    created_at: '2026-10-24T04:22:00.000Z',
  },
]
const appointments = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-10-25T12:00:00.000Z',
    starts_at: '2026-10-26T15:00:00.000Z',
    ends_at: '2026-10-26T16:00:00.000Z',
    status: 'booked',
    source: 'public',
    customer_name: 'Booking Guest',
    phone: '713-555-0199',
    email: 'guest@example.com',
    address: '2 Oak Street',
    kwh: 400,
    bill_amount: 80,
    esiid: null,
    meter_number: null,
    tdu: null,
    rep_puct_certificate: null,
    avg_monthly_kwh: null,
    usage_history: [{ month: '2026-09', kwh: 400 }],
    hub_appointment_files: [],
  },
]
const activity = []
const seen = []
const objects = new Map()

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.local`
}

function readJwt(token) {
  const part = String(token || '').split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function memberFromToken(token) {
  const payload = readJwt(token)
  if (!payload || payload.role !== 'authenticated') return null
  return MEMBERS[payload.sub] || null
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function fileBytes(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '')
  if (!match) return body
  const boundary = `--${(match[1] || match[2]).trim()}`
  const marker = Buffer.from(boundary)
  let cursor = body.indexOf(marker)
  while (cursor !== -1) {
    const next = body.indexOf(marker, cursor + marker.length)
    if (next === -1) break
    const part = body.subarray(cursor + marker.length, next)
    const split = part.indexOf('\r\n\r\n')
    if (split !== -1) {
      const headers = part.subarray(0, split).toString('utf8')
      if (!/name="cacheControl"/i.test(headers)) {
        let data = part.subarray(split + 4)
        if (data.subarray(-2).toString() === '\r\n') data = data.subarray(0, -2)
        if (data.length) return data
      }
    }
    cursor = next
  }
  return body
}

function send(res, status, body, contentType = 'application/json') {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body))
  const origin = res.req?.headers?.origin || '*'
  res.statusCode = status
  res.setHeader('content-type', contentType)
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', res.req?.headers?.['access-control-request-headers'] || '*')
  res.setHeader('access-control-expose-headers', 'content-range')
  res.setHeader('vary', 'origin')
  res.end(payload)
}

function fail(res, status, message, code = '42501') {
  send(res, status, { code, message, details: null, hint: null })
}

function wantsObject(req) {
  return String(req.headers.accept || '').includes('application/vnd.pgrst.object+json')
}

function eqFilter(url, key) {
  const value = url.searchParams.get(key)
  return value && value.startsWith('eq.') ? decodeURIComponent(value.slice(3)) : null
}

function sessionFor(member) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60
  const access_token = jwt({ sub: member.id, role: 'authenticated', email: member.email, exp })
  return {
    access_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `refresh-${member.id}`,
    user: {
      id: member.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: member.email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    },
  }
}

function caller(req) {
  const apikey = String(req.headers.apikey || '')
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (apikey.startsWith('sb_secret_') && !token) return { role: 'service', member: null }
  const member = memberFromToken(token)
  if (member) return { role: 'member', member }
  if (apikey.startsWith('sb_secret_')) return { role: 'service', member: null }
  return { role: 'anon', member: null }
}

const server = createServer(async (req, res) => {
  res.req = req
  if (req.method === 'OPTIONS') {
    send(res, 204, '')
    return
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const body = await readBody(req)
  let json = null
  if (body.length && String(req.headers['content-type'] || '').includes('application/json')) {
    try {
      json = JSON.parse(body.toString('utf8'))
    } catch {
      return fail(res, 400, 'Invalid request.', '22P02')
    }
  }
  console.log(req.method, url.pathname)

  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type')
    if (grant === 'password') {
      const email = String(json?.email || '').trim().toLowerCase()
      const member = Object.values(MEMBERS).find((item) => item.email === email && item.password === json?.password)
      if (!member) return fail(res, 400, 'Invalid login credentials', 'invalid_grant')
      return send(res, 200, sessionFor(member))
    }
    if (grant === 'refresh_token') {
      const id = String(json?.refresh_token || '').replace('refresh-', '')
      const member = MEMBERS[id]
      if (!member) return fail(res, 401, 'Invalid refresh token', 'invalid_grant')
      return send(res, 200, sessionFor(member))
    }
    return fail(res, 400, 'Unsupported grant', 'invalid_grant')
  }

  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const member = memberFromToken(token)
    if (!member) return fail(res, 401, 'Please sign in to the dashboard.', '401')
    return send(res, 200, sessionFor(member).user)
  }

  const who = caller(req)
  if (who.role === 'anon') return fail(res, 401, 'Please sign in to the dashboard.', '401')

  if (url.pathname === '/rest/v1/hub_profiles' && req.method === 'GET') {
    const id = eqFilter(url, 'id')
    const rows = Object.values(MEMBERS).filter((member) => !id || member.id === id).map(({ password, ...profile }) => profile)
    if (wantsObject(req)) {
      if (rows.length !== 1) return fail(res, 406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116')
      return send(res, 200, rows[0])
    }
    return send(res, 200, rows)
  }

  if (url.pathname === '/rest/v1/powergenie_customers' && req.method === 'GET') {
    return send(res, 200, customers)
  }

  if (url.pathname === '/rest/v1/powergenie_customers' && req.method === 'POST') {
    if (who.role !== 'member') return fail(res, 403, 'permission denied')
    const row = json || {}
    if (row.created_by !== `manual:${who.member.id}`) return fail(res, 403, 'new row violates row-level security policy')
    if (row.archived_at || row.archived_by) return fail(res, 403, 'new row violates row-level security policy')
    if (!row.id || !row.customer_name || !row.service_address || !row.utility || !STAGES.has(row.stage)) {
      return fail(res, 400, 'null value in column "customer_name" violates not-null constraint', '23502')
    }
    if (row.esiid && !/^[0-9]{17,22}$/.test(row.esiid)) return fail(res, 400, 'powergenie_customers_esiid_digits', '23514')
    if (customers.some((item) => item.id === row.id)) return fail(res, 409, 'duplicate key', '23505')
    const stored = { ...row, archived_at: null, archived_by: null, acknowledged: row.acknowledged ?? 0 }
    customers.unshift(stored)
    return send(res, 201, wantsObject(req) ? { id: stored.id } : [{ id: stored.id }])
  }

  if (url.pathname === '/rest/v1/powergenie_customers' && req.method === 'PATCH') {
    if (who.role !== 'member') return fail(res, 403, 'permission denied')
    const id = eqFilter(url, 'id')
    const row = customers.find((item) => item.id === id)
    if (!row) return send(res, 200, wantsObject(req) ? null : [])
    const patch = json || {}
    for (const key of Object.keys(patch)) {
      if (PROTECTED.has(key)) return fail(res, 403, `permission denied for column ${key}`)
    }
    if (patch.stage && !STAGES.has(patch.stage)) return fail(res, 400, 'powergenie_customers_stage_check', '23514')
    if (patch.esiid && !/^[0-9]{17,22}$/.test(patch.esiid)) return fail(res, 400, 'powergenie_customers_esiid_digits', '23514')
    Object.assign(row, patch)
    return send(res, 200, wantsObject(req) ? { id: row.id } : [{ id: row.id }])
  }

  if (url.pathname === '/rest/v1/powergenie_customers' && req.method === 'DELETE') {
    return fail(res, 403, 'permission denied for table powergenie_customers')
  }

  if (url.pathname === '/rest/v1/powergenie_files' && req.method === 'GET') {
    const category = eqFilter(url, 'category')
    return send(res, 200, files.filter((file) => !category || file.category === category))
  }

  if (url.pathname === '/rest/v1/powergenie_files' && req.method === 'POST') {
    if (who.role !== 'member') return fail(res, 403, 'permission denied')
    const row = json || {}
    const prefix = `customers/${row.customer_id}/light_bill/`
    if (row.category !== 'light_bill' || row.uploaded_by !== who.member.id || !String(row.storage_path || '').startsWith(prefix) || !BILL_PATH.test(row.storage_path || '')) {
      return fail(res, 403, 'new row violates row-level security policy')
    }
    files.unshift(row)
    return send(res, 201, wantsObject(req) ? { id: row.id } : [{ id: row.id }])
  }

  if (url.pathname === '/rest/v1/powergenie_activity' && req.method === 'POST') {
    if (who.role !== 'member') return fail(res, 403, 'permission denied')
    activity.unshift(json)
    return send(res, 201, wantsObject(req) ? { id: json?.id } : [])
  }

  if (url.pathname === '/rest/v1/hub_appointments' && req.method === 'GET') {
    return send(res, 200, appointments)
  }

  if (url.pathname === '/rest/v1/hub_lead_seen' && req.method === 'GET') {
    const userId = eqFilter(url, 'user_id')
    return send(res, 200, seen.filter((row) => !userId || row.user_id === userId))
  }

  if (url.pathname === '/rest/v1/hub_lead_seen' && req.method === 'POST') {
    if (who.role !== 'member' || json?.user_id !== who.member.id) return fail(res, 403, 'new row violates row-level security policy')
    const index = seen.findIndex((row) => row.user_id === json.user_id && row.source === json.source && row.lead_id === json.lead_id)
    if (index >= 0) seen[index] = json
    else seen.push(json)
    return send(res, 201, [])
  }

  if (req.method === 'POST' && url.pathname.startsWith('/storage/v1/object/powergenie/')) {
    if (who.role !== 'member') return fail(res, 403, 'permission denied')
    const objectPath = decodeURIComponent(url.pathname.slice('/storage/v1/object/powergenie/'.length))
    if (!BILL_PATH.test(objectPath)) return fail(res, 403, 'new row violates row-level security policy')
    objects.set(objectPath, fileBytes(body, String(req.headers['content-type'] || '')))
    return send(res, 200, { Id: objectPath, Key: `powergenie/${objectPath}` })
  }

  if (req.method === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/')) {
    if (who.role !== 'member') return fail(res, 403, 'permission denied')
    const objectPath = decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/'.length))
    return send(res, 200, { signedURL: `/object/sign/${objectPath}?token=local` })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/sign/')) {
    const objectPath = decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/'.length)).replace(/^powergenie\//, '')
    const bytes = objects.get(objectPath)
    if (!bytes) return fail(res, 404, 'Object not found', '404')
    return send(res, 200, bytes, 'application/octet-stream')
  }

  return fail(res, 404, 'Not found', '404')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`hub lead fixture http://127.0.0.1:${PORT}`)
})
