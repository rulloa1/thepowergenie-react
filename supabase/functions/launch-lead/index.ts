/**
 * Public form endpoint for the four standalone launch pages:
 * Gas Genie, Celebrity Solar, Hip Hop Solar and Sport & Solar.
 *
 * - Every lead is kept in public.brand_leads.
 * - Solar leads also go into the Referral Hub (powergenie_customers) at stage
 *   bill_received, with the address and an "Electric bill: $X-$Y" note line, so
 *   the sales workflow can estimate usage, draw the roof and draft a proposal.
 *   Gas Genie is natural gas, so it stays out of the solar Hub.
 * - Each lead texts and emails an alert through Twilio and Resend, using the
 *   same secrets as the booking alerts. A missing setting skips that channel.
 */

const SITES = {
  'gas-genie': { name: 'Gas Genie', solar: false },
  'celebrity-solar': { name: 'Celebrity Solar', solar: true },
  'hip-hop-solar': { name: 'Hip Hop Solar', solar: true },
  'sport-and-solar': { name: 'Sport & Solar', solar: true },
} as const

type Site = keyof typeof SITES

/** Bill choices on the forms, written the way billHintFromNotes reads them. */
const BILL_RANGES: Record<string, string> = {
  'under-100': '$50-$100',
  '100-150': '$100-$150',
  '150-200': '$150-$200',
  '200-300': '$200-$300',
  '300-plus': '$300-$500',
}

const CONSENT_VERSION = 'launch-pages-2026-10-27'
const PROJECT_REF = 'ogwiopxnjpwwzleqwobq'
const HUB_URL = 'https://thepowergenie.theroyeffect.com/dashboard?tab=leads'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

function env(name: string): string {
  return (Deno.env.get(name) || '').trim()
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function list(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

function chicagoDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

class BadRequest extends Error {}

export type LaunchLead = {
  site: Site
  name: string
  phone: string | null
  email: string | null
  zip: string
  address: string | null
  billRange: string | null
  choice: string | null
  pageUrl: string | null
}

export function parseLaunchLead(body: unknown): LaunchLead | 'honeypot' {
  if (!body || typeof body !== 'object') throw new BadRequest('Invalid request.')
  const b = body as Record<string, unknown>
  if (text(b.company, 200)) return 'honeypot'
  const site = text(b.site, 40) as Site
  if (!(site in SITES)) throw new BadRequest('Unknown page.')
  if (b.consent !== true) throw new BadRequest('Please check the consent box.')
  const name = text(b.name, 120)
  if (name.length < 2) throw new BadRequest('Please enter your name.')
  const zip = text(b.zip, 5)
  if (!/^\d{5}$/.test(zip)) throw new BadRequest('Please enter a 5-digit ZIP code.')
  const choice = text(b.choice, 80) || null
  const pageUrl = text(b.pageUrl, 300) || null

  if (!SITES[site].solar) {
    const email = text(b.email, 200).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest('Please enter your email.')
    return { site, name, phone: null, email, zip, address: null, billRange: null, choice, pageUrl }
  }

  const phone = text(b.phone, 30)
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) throw new BadRequest('Please enter your phone number.')
  const address = text(b.address, 200)
  if (address.length < 6 || !/\d/.test(address)) throw new BadRequest('Please enter your home address.')
  const billRange = BILL_RANGES[text(b.bill, 20)]
  if (!billRange) throw new BadRequest('Please pick your monthly electric bill.')
  return { site, name, phone, email: null, zip, address, billRange, choice, pageUrl }
}

/** Full service address for the roof lookup: adds the ZIP when it is not already there. */
export function serviceAddress(lead: LaunchLead): string {
  const address = lead.address || ''
  return address.includes(lead.zip) ? address : `${address}, TX ${lead.zip}`
}

export function hubRecords(lead: LaunchLead, id: string, now: Date) {
  const site = SITES[lead.site].name
  const createdAt = now.toISOString()
  const loggedOn = chicagoDate(now)
  const notes = [
    `Launch page lead: ${site}`,
    `Referral source: ${lead.site}`,
    lead.choice ? `Picked: ${lead.choice}` : null,
    `Electric bill: ${lead.billRange}`,
    `Phone: ${lead.phone}`,
    'TCPA consent: yes',
    `Consent version: ${CONSENT_VERSION}`,
    `Consent at: ${createdAt}`,
    'Bill: not attached',
  ].filter(Boolean).join('\n')
  const customer = {
    id,
    created_at: createdAt,
    logged_on: loggedOn,
    created_by: null,
    customer_name: lead.name,
    phone: lead.phone,
    email: null,
    service_address: serviceAddress(lead),
    utility: 'Not provided',
    notes,
    date_sent_to_horace: loggedOn,
    stage: 'bill_received',
    acknowledged: 0,
    next_step: 'Call new launch-page lead',
    next_step_due: loggedOn,
    updated_at: createdAt,
  }
  const activity = {
    id: `${id}-activity`,
    customer_id: id,
    actor_id: null,
    actor_name: 'Launch page',
    type: 'website_lead',
    message: `New lead from the ${site} launch page. Monthly bill ${lead.billRange}. No bill attached yet. TCPA consent recorded.`,
    created_at: createdAt,
  }
  return { customer, activity }
}

async function insert(table: string, row: Record<string, unknown>): Promise<void> {
  const base = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SB_SECRET_KEY')
  if (!base || !key) throw new Error('service_not_configured')
  const response = await fetch(`${base}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })
  if (!response.ok) throw new Error(`insert_${table}_${response.status}: ${(await response.text()).slice(0, 200)}`)
}

export function alertText(lead: LaunchLead, inHub: boolean): string {
  return [
    `New ${SITES[lead.site].name} lead`,
    `Name: ${lead.name}`,
    lead.phone ? `Phone: ${lead.phone}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.address ? `Address: ${serviceAddress(lead)}` : `ZIP: ${lead.zip}`,
    lead.billRange ? `Electric bill: ${lead.billRange}/mo` : null,
    lead.choice ? `Picked: ${lead.choice}` : null,
    inHub ? `Hub: ${HUB_URL}` : `Leads table: https://supabase.com/dashboard/project/${PROJECT_REF}/editor`,
  ].filter(Boolean).join('\n')
}

async function sendEmail(id: string, lead: LaunchLead, body: string): Promise<boolean> {
  const key = env('RESEND_API_KEY')
  const from = env('NOTIFY_FROM')
  const to = list(env('NOTIFY_EMAIL_TO')).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (!key || !from || to.length === 0) return false
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'Idempotency-Key': `launch-lead-${id}` },
    body: JSON.stringify({ from, to, subject: `New ${SITES[lead.site].name} lead: ${lead.name.slice(0, 80)}`, text: body }),
  })
  if (!response.ok) console.error('launch_lead_email_failed', response.status)
  return response.ok
}

async function sendSms(body: string): Promise<boolean> {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_FROM')
  const recipients = list(env('NOTIFY_SMS_TO')).filter((p) => /^\+[1-9]\d{7,14}$/.test(p))
  if (!sid || !token || !from || recipients.length === 0) return false
  const auth = btoa(`${sid}:${token}`)
  const results = await Promise.all(recipients.map(async (to) => {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    })
    if (!response.ok) console.error('launch_lead_sms_failed', response.status)
    return response.ok
  }))
  return results.some(Boolean)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Not allowed.' }, 405)

  let lead: LaunchLead | 'honeypot'
  try {
    const raw = await req.text()
    if (raw.length > 5000) throw new BadRequest('Invalid request.')
    lead = parseLaunchLead(JSON.parse(raw))
  } catch (error) {
    return json({ error: error instanceof BadRequest ? error.message : 'Invalid request.' }, 400)
  }
  if (lead === 'honeypot') return json({ ok: true })

  const id = crypto.randomUUID()
  const now = new Date()
  try {
    await insert('brand_leads', {
      site: lead.site,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      zip: lead.zip,
      choice: lead.choice,
      consent: true,
      page_url: lead.pageUrl,
    })
    let inHub = false
    if (SITES[lead.site].solar) {
      const { customer, activity } = hubRecords(lead, id, now)
      await insert('powergenie_customers', customer)
      await insert('powergenie_activity', activity).catch((e) => console.error('launch_lead_activity_failed', String(e)))
      inHub = true
    }
    const body = alertText(lead, inHub)
    const [email, sms] = await Promise.all([
      sendEmail(id, lead, body).catch(() => false),
      sendSms(body).catch(() => false),
    ])
    return json({ ok: true, hub: inHub, alerts: { email, sms } })
  } catch (error) {
    console.error('launch_lead_failed', error instanceof Error ? error.message : 'unknown')
    return json({ error: "That didn't go through. Please try again." }, 500)
  }
})
