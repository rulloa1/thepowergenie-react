/**
 * Instant alerts for leads from the four standalone launch pages
 * (Gas Genie, Celebrity Solar, Hip Hop Solar, Sport & Solar).
 *
 * A database trigger on public.brand_leads calls this with { id } right after
 * each insert. The function claims the row by setting alerted_at, so each lead
 * alerts once, and only rows created in the last 10 minutes can be claimed. That
 * keeps a public caller from replaying alerts for old leads.
 *
 * Email goes through Resend and texts through Twilio, using the same secrets as
 * the booking function's alerts. A missing setting skips that channel.
 */

const SITE_NAMES: Record<string, string> = {
  'gas-genie': 'Gas Genie',
  'celebrity-solar': 'Celebrity Solar',
  'hip-hop-solar': 'Hip Hop Solar',
  'sport-and-solar': 'Sport & Solar',
}

const PROJECT_REF = 'ogwiopxnjpwwzleqwobq'

type BrandLead = {
  id: number
  created_at: string
  site: string
  name: string
  phone: string | null
  email: string | null
  zip: string
  choice: string | null
  consent: boolean
}

function env(name: string): string {
  return (Deno.env.get(name) || '').trim()
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function list(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

function oneLine(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

async function claim(id: number): Promise<BrandLead | null> {
  const base = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('SB_SECRET_KEY')
  if (!base || !key) throw new Error('service_not_configured')
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const url = `${base}/rest/v1/brand_leads?id=eq.${id}&alerted_at=is.null&created_at=gte.${encodeURIComponent(since)}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({ alerted_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`claim_failed_${response.status}`)
  const rows = (await response.json()) as BrandLead[]
  return rows[0] ?? null
}

export function alertText(lead: BrandLead): string {
  const site = SITE_NAMES[lead.site] ?? lead.site
  return [
    `New ${site} lead`,
    `Name: ${oneLine(lead.name) || 'not provided'}`,
    lead.phone ? `Phone: ${oneLine(lead.phone)}` : null,
    lead.email ? `Email: ${oneLine(lead.email)}` : null,
    `ZIP: ${lead.zip}`,
    lead.choice ? `Picked: ${oneLine(lead.choice)}` : null,
    `Contact consent: ${lead.consent ? 'yes' : 'no'}`,
    `https://supabase.com/dashboard/project/${PROJECT_REF}/editor`,
  ].filter(Boolean).join('\n')
}

async function sendEmail(lead: BrandLead, text: string): Promise<boolean> {
  const key = env('RESEND_API_KEY')
  const from = env('NOTIFY_FROM')
  const to = list(env('NOTIFY_EMAIL_TO')).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (!key || !from || to.length === 0) return false
  const site = SITE_NAMES[lead.site] ?? lead.site
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'Idempotency-Key': `brand-lead-${lead.id}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New ${site} lead: ${oneLine(lead.name).slice(0, 80) || 'New lead'}`,
      text,
    }),
  })
  if (!response.ok) console.error('brand_lead_email_failed', response.status)
  return response.ok
}

async function sendSms(text: string): Promise<boolean> {
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
      body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
    })
    if (!response.ok) console.error('brand_lead_sms_failed', response.status)
    return response.ok
  }))
  return results.some(Boolean)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let id: number
  try {
    const body = await req.json()
    id = Number(body?.id)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad_request' }, 400)

  try {
    const lead = await claim(id)
    if (!lead) return json({ alerted: false })
    const text = alertText(lead)
    const [email, sms] = await Promise.all([
      sendEmail(lead, text).catch(() => false),
      sendSms(text).catch(() => false),
    ])
    return json({ alerted: true, email, sms })
  } catch (error) {
    console.error('brand_lead_alert_failed', error instanceof Error ? error.message : 'unknown')
    return json({ error: 'alert_failed' }, 500)
  }
})
