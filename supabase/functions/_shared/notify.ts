/**
 * Instant lead alerts. Email via Resend and SMS via Twilio.
 * Every setting is optional: a missing value skips that channel.
 * A failed alert never throws — callers still return a saved booking.
 */

export type LeadAlert = {
  /** Lead or appointment id. Sent as Resend's Idempotency-Key. */
  id: string
  source: 'assistant' | 'booking'
  name: string
  address: string
  kwh: number | null
  amount: number | null
  appointment: string
  billAttached: boolean
  dashboardUrl: string
}

export type NotifyEnv = {
  resendApiKey?: string
  notifyFrom?: string
  notifyEmailTo?: string
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioFrom?: string
  notifySmsTo?: string
}

export type AlertFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>

const PRODUCTION_ORIGIN = 'https://thepowergenie.theroyeffect.com'

export function siteOrigin(configured: string | undefined): string {
  const value = (configured || '').trim()
  if (!value) return PRODUCTION_ORIGIN
  return value.replace(/\/+$/, '')
}

export function dashboardLeadUrl(origin: string, id: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/dashboard?tab=leads&id=${encodeURIComponent(id)}`
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function splitList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function leadAlertText(alert: LeadAlert): string {
  const source = alert.source === 'assistant' ? 'Website assistant' : 'Booking page'
  const kwh = alert.kwh == null ? 'not on the bill' : `${Math.round(alert.kwh).toLocaleString('en-US')} kWh`
  const amount = alert.amount == null
    ? 'not on the bill'
    : alert.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return [
    `New Power Genie lead (${source})`,
    `Name: ${oneLine(alert.name) || 'not provided'}`,
    `Address: ${oneLine(alert.address) || 'not provided'}`,
    `kWh: ${kwh}`,
    `Amount: ${amount}`,
    `Appointment: ${oneLine(alert.appointment) || 'not provided'}`,
    `Bill attached: ${alert.billAttached ? 'yes' : 'no'}`,
    alert.dashboardUrl,
  ].join('\n')
}

function base64(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes = new TextEncoder().encode(input)
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0
    const triple = (a << 16) | (b << 8) | c
    out += alphabet[(triple >> 18) & 63]
    out += alphabet[(triple >> 12) & 63]
    out += index + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '='
    out += index + 2 < bytes.length ? alphabet[triple & 63] : '='
  }
  return out
}

async function sendEmail(alert: LeadAlert, env: NotifyEnv, fetchImpl: AlertFetch, text: string): Promise<void> {
  const key = env.resendApiKey?.trim()
  const from = env.notifyFrom?.trim()
  const to = splitList(env.notifyEmailTo).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  if (!key || !from || to.length === 0) return
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'Idempotency-Key': alert.id,
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New Power Genie lead: ${oneLine(alert.name).slice(0, 80) || 'New lead'}`,
        text,
      }),
    })
    if (!response.ok) console.error('lead_alert_email_failed', response.status)
  } catch (error) {
    console.error('lead_alert_email_failed', error instanceof Error ? error.name : 'unknown')
  }
}

async function sendSms(alert: LeadAlert, env: NotifyEnv, fetchImpl: AlertFetch, text: string): Promise<void> {
  const sid = env.twilioAccountSid?.trim()
  const token = env.twilioAuthToken?.trim()
  const from = env.twilioFrom?.trim()
  const recipients = splitList(env.notifySmsTo).filter((phone) => /^\+[1-9]\d{7,14}$/.test(phone))
  if (!sid || !token || !from || recipients.length === 0) return
  const auth = base64(`${sid}:${token}`)
  await Promise.all(recipients.map(async (to) => {
    try {
      const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
      })
      if (!response.ok) console.error('lead_alert_sms_failed', response.status)
    } catch (error) {
      console.error('lead_alert_sms_failed', error instanceof Error ? error.name : 'unknown')
    }
  }))
}

export async function sendLeadAlert(alert: LeadAlert, env: NotifyEnv, fetchImpl: AlertFetch = fetch): Promise<void> {
  const text = leadAlertText(alert)
  try {
    await Promise.all([
      sendEmail(alert, env, fetchImpl, text),
      sendSms(alert, env, fetchImpl, text),
    ])
  } catch (error) {
    console.error('lead_alert_failed', error instanceof Error ? error.name : 'unknown')
  }
}
