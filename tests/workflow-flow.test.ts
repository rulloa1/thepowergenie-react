import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

/**
 * Runs the sales workflow against a small in-memory stand-in for PostgREST,
 * with email, text and Google calls captured instead of sent.
 */

type Row = Record<string, unknown>

const UNIQUE: Record<string, string[][]> = {
  hub_settings: [['id']],
  hub_lead_workflow: [['lead_id'], ['contact_token']],
  hub_proposals: [['id'], ['public_token']],
  hub_tasks: [['id'], ['lead_id', 'kind']],
  hub_followups: [['id'], ['lead_id', 'key', 'channel']],
  powergenie_customers: [['id']],
  powergenie_activity: [['id']],
}

function defaults(table: string): Row {
  const now = new Date().toISOString()
  switch (table) {
    case 'hub_lead_workflow':
      return { overrides: {}, usage: null, system: null, savings: null, design: null, design_status: 'pending', design_note: null, design_fetched_at: null, contact_token: randomBytes(18).toString('hex'), opted_out_at: null, last_stage: null, updated_at: now }
    case 'hub_proposals':
      return { id: randomUUID(), public_token: randomBytes(24).toString('hex'), created_at: now, updated_at: now, approved_at: null, approved_by_name: null, sent_at: null, sent_channels: [], viewed_at: null, view_count: 0, interested_at: null }
    case 'hub_tasks':
      return { id: randomUUID(), detail: null, done_at: null, done_by: null, done_by_name: null, cancelled_at: null, created_at: now }
    case 'hub_followups':
      return { id: randomUUID(), status: 'scheduled', subject: null, sent_at: null, note: null, created_at: now }
    default:
      return {}
  }
}

function matches(row: Row, key: string, raw: string): boolean {
  const value = row[key]
  const [op, ...rest] = raw.split('.')
  const arg = rest.join('.')
  switch (op) {
    case 'eq': return String(value) === arg
    case 'neq': return String(value) !== arg
    case 'is': return arg === 'null' ? value == null : String(value) === arg
    case 'lte': return value != null && String(value) <= arg
    case 'in': return arg.replace(/^\(|\)$/g, '').split(',').map(item => item.replace(/^"|"$/g, '')).includes(String(value))
    default: throw new Error(`unsupported filter ${raw}`)
  }
}

class FakeDb {
  tables = new Map<string, Row[]>()
  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table)!
  }
  conflict(table: string, row: Row): Row | null {
    for (const keys of UNIQUE[table] || []) {
      if (table === 'hub_proposals' && row.status !== 'draft' && keys.length === 1 && keys[0] === 'lead_id') continue
      const found = this.rows(table).find(other => keys.every(key => other[key] === row[key]))
      if (found) return found
    }
    if (table === 'hub_proposals' && row.status === 'draft') {
      return this.rows(table).find(other => other.lead_id === row.lead_id && other.status === 'draft') || null
    }
    return null
  }
  handle(method: string, url: URL, body: unknown, prefer: string): { status: number; body: unknown } {
    const table = url.pathname.replace('/rest/v1/', '')
    const filters = [...url.searchParams.entries()].filter(([key]) => !['select', 'order', 'limit', 'on_conflict'].includes(key))
    const pick = () => this.rows(table).filter(row => filters.every(([key, value]) => matches(row, key, value)))
    if (method === 'GET') {
      let out = pick()
      const order = url.searchParams.get('order')
      if (order) {
        const [col, dir] = order.split('.')
        out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (dir === 'desc' ? -1 : 1))
      }
      const limit = Number(url.searchParams.get('limit') || 0)
      return { status: 200, body: limit ? out.slice(0, limit) : out }
    }
    if (method === 'PATCH') {
      const out = pick()
      for (const row of out) Object.assign(row, body as Row)
      return { status: 200, body: out }
    }
    if (method === 'POST') {
      const items = Array.isArray(body) ? body : [body]
      const created: Row[] = []
      for (const item of items as Row[]) {
        const row = { ...defaults(table), ...item }
        const existing = this.conflict(table, row)
        if (existing) {
          if (prefer.includes('merge-duplicates')) {
            Object.assign(existing, item)
            created.push(existing)
            continue
          }
          if (prefer.includes('ignore-duplicates')) continue
          return { status: 409, body: { message: 'duplicate key' } }
        }
        this.rows(table).push(row)
        created.push(row)
      }
      return { status: 201, body: created }
    }
    return { status: 405, body: {} }
  }
}

let db: FakeDb
let sent: Array<{ kind: 'email' | 'sms'; to: string; body: string }>
const realFetch = globalThis.fetch

beforeEach(() => {
  db = new FakeDb()
  sent = []
  process.env.SUPABASE_URL = 'http://db.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'
  process.env.RESEND_API_KEY = 're_test'
  process.env.NOTIFY_FROM = 'The Power Genie <hello@example.test>'
  process.env.NOTIFY_EMAIL_TO = 'team@example.test'
  process.env.SITE_URL = 'https://genie.example.test'
  delete process.env.GOOGLE_MAPS_API_KEY
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.host === 'db.test') {
      const headers = new Headers(init?.headers)
      const text = typeof init?.body === 'string' ? init.body : ''
      const result = db.handle(init?.method || 'GET', url, text ? JSON.parse(text) : null, headers.get('prefer') || '')
      return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } })
    }
    if (url.host === 'api.resend.com') {
      const payload = JSON.parse(String(init?.body)) as { to: string[]; text: string }
      sent.push({ kind: 'email', to: payload.to[0], body: payload.text })
      return new Response('{}', { status: 200 })
    }
    if (url.host === 'api.twilio.com') {
      const params = new URLSearchParams(String(init?.body))
      sent.push({ kind: 'sms', to: params.get('To') || '', body: params.get('Body') || '' })
      return new Response('{}', { status: 201 })
    }
    throw new Error(`unexpected fetch ${url.href}`)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function addLead(row: Row): Row {
  const lead = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: null,
    customer_name: 'Pat Example',
    service_address: '1 Main St, Spring, TX 77373',
    phone: '+17135550100',
    email: 'pat@example.test',
    notes: null,
    kwh_this_period: null,
    days: null,
    avg_monthly_kwh: null,
    usage_history: null,
    total_due: null,
    current_charges: null,
    stage: 'bill_received',
    esiid: null,
    archived_at: null,
    ...row,
  }
  db.rows('powergenie_customers').push(lead)
  return lead
}

const engine = await import('../server/workflow/engine')
const actor = { id: '24770b85-66ec-485c-9191-366f4850d76d', name: 'Horace Lawrence' }

test('a lead without usage asks for the bill and does not invent numbers', async () => {
  const lead = addLead({})
  const result = await engine.runLead(String(lead.id))
  assert.equal(result.stage, 'bill_received')
  assert.equal(result.usage, null)
  const tasks = db.rows('hub_tasks')
  assert.deepEqual(tasks.map(task => task.kind), ['get_bill'])
  const followups = db.rows('hub_followups')
  assert.ok(followups.some(row => row.key === 'bill_received:steps' && row.channel === 'email'))
  assert.equal(followups.some(row => row.channel === 'sms'), false, 'no texts without consent')
  assert.equal(db.rows('hub_proposals').length, 0)
})

test('without a plan rate the lead stops before a proposal', async () => {
  const lead = addLead({ avg_monthly_kwh: 1200, kwh_this_period: 1300, current_charges: 195 })
  const result = await engine.runLead(String(lead.id))
  assert.equal(result.savingsReady, false)
  assert.deepEqual(result.missing, ['plan rate', 'plan yearly increase'])
  assert.equal(result.stage, 'panel_design')
  assert.equal(db.rows('hub_proposals').length, 0)
  assert.equal(db.rows('hub_tasks').find(task => task.kind === 'get_bill')?.done_by_name ?? null, null)
})

test('with a rate a draft waits for approval, then goes out and follow-ups start', async () => {
  await engine.saveSettings({ ppaRateCents: 13, ppaEscalatorPct: 2.9 }, actor)
  const lead = addLead({ avg_monthly_kwh: 1200, kwh_this_period: 1300, current_charges: 195, notes: 'TCPA consent: yes' })
  const first = await engine.runLead(String(lead.id))
  assert.equal(first.stage, 'proposal_ready')
  assert.equal(first.designStatus, 'no_key')
  const drafts = db.rows('hub_proposals')
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].status, 'draft')
  assert.ok(db.rows('hub_tasks').some(task => task.kind === 'approve_proposal' && task.done_at == null))
  assert.equal(sent.length, 0, 'nothing goes to the customer before approval')

  // Running again with nothing new keeps the same draft.
  await engine.runLead(String(lead.id))
  assert.equal(db.rows('hub_proposals').length, 1)

  const approved = await engine.approveProposal(String(drafts[0].id), actor, true)
  assert.equal(approved.status, 'sent')
  assert.ok(approved.channels.includes('email'))
  assert.ok(sent.some(message => message.kind === 'email' && message.body.includes(`/proposal/${drafts[0].public_token}`)))
  assert.equal(db.rows('powergenie_customers')[0].stage, 'presented')
  assert.ok(db.rows('hub_tasks').some(task => task.kind === 'approve_proposal' && task.done_by_name === 'Horace Lawrence'))
  assert.ok(db.rows('hub_tasks').some(task => task.kind === 'call_after_proposal'))
  assert.ok(db.rows('hub_followups').some(row => row.key === 'presented:check_in' && row.status === 'scheduled'))

  await assert.rejects(() => engine.approveProposal(String(drafts[0].id), actor, true), /already approved/)

  const interested = await engine.recordInterest(String(drafts[0].public_token))
  assert.ok(interested?.interested_at)
  assert.ok(db.rows('hub_tasks').some(task => task.kind === 'interested'))
  assert.ok(sent.some(message => message.to === 'team@example.test'))
})

test('a lead the team already worked is not emailed on its first run', async () => {
  const lead = addLead({ created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() })
  await engine.runLead(String(lead.id))
  assert.equal(db.rows('hub_followups').length, 0)
  assert.equal(db.rows('hub_tasks').length, 1)
})

test('due follow-ups send, and stop once the bill is in or the customer opts out', async () => {
  const lead = addLead({})
  await engine.runLead(String(lead.id))
  for (const row of db.rows('hub_followups')) row.send_at = new Date(Date.now() - 1000).toISOString()
  const first = await engine.tick()
  assert.equal(first.messages.sent, 2)
  assert.equal(sent.filter(message => message.kind === 'email').length, 2)

  const other = addLead({ email: 'sam@example.test', customer_name: 'Sam Other' })
  await engine.runLead(String(other.id))
  const token = String(db.rows('hub_lead_workflow').find(row => row.lead_id === other.id)?.contact_token)
  assert.equal(await engine.unsubscribe(token), true)
  assert.equal(db.rows('hub_followups').filter(row => row.lead_id === other.id).every(row => row.status === 'cancelled'), true)
})

test('finishing a stage task moves the lead forward', async () => {
  const lead = addLead({ stage: 'signed', avg_monthly_kwh: 1000 })
  await engine.runLead(String(lead.id))
  const task = db.rows('hub_tasks').find(row => row.kind === 'schedule_survey')
  assert.ok(task)
  await engine.completeTask(String(task!.id), actor)
  assert.equal(db.rows('powergenie_customers')[0].stage, 'site_survey')
  assert.ok(db.rows('hub_tasks').some(row => row.kind === 'submit_permits'))
})

test('marking a lead lost clears its tasks and messages', async () => {
  const lead = addLead({})
  await engine.runLead(String(lead.id))
  db.rows('powergenie_customers')[0].stage = 'lost'
  await engine.runLead(String(lead.id))
  assert.equal(db.rows('hub_tasks').every(row => row.cancelled_at != null || row.done_at != null), true)
  assert.equal(db.rows('hub_followups').every(row => row.status === 'cancelled'), true)
})
