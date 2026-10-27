import { dashboardLeadUrl, sendLeadAlert, siteOrigin, type LeadAlert } from '../supabase/functions/_shared/notify.js'

export type NewLead = Omit<LeadAlert, 'dashboardUrl'>

function notifyEnv() {
  return {
    resendApiKey: process.env.RESEND_API_KEY,
    notifyFrom: process.env.NOTIFY_FROM,
    notifyEmailTo: process.env.NOTIFY_EMAIL_TO,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioFrom: process.env.TWILIO_FROM,
    notifySmsTo: process.env.NOTIFY_SMS_TO,
  }
}

function splitList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function fetchWithTimeout(ms: number) {
  return (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(ms) }).then(response => ({ ok: response.ok, status: response.status }))
}

/** Sends the alert and swallows every failure. */
export async function notifyNewLead(alert: NewLead): Promise<void> {
  const origin = siteOrigin(process.env.SITE_URL)
  await sendLeadAlert(
    { ...alert, dashboardUrl: dashboardLeadUrl(origin, alert.id) },
    notifyEnv(),
    fetchWithTimeout(12_000),
  )
}

/** Send custom email via Resend */
export async function sendCustomEmail(to: string, subject: string, text: string): Promise<boolean> {
  const env = notifyEnv()
  const key = env.resendApiKey?.trim()
  const from = env.notifyFrom?.trim()
  if (!key || !from || !to) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to.trim()],
        subject,
        text,
      }),
    })
    if (!res.ok) {
      // Resend explains refusals (unverified domain, bad key) in the body. No secrets in it.
      const detail = await res.text().catch(() => '')
      console.error('sendCustomEmail_rejected', res.status, detail.slice(0, 300))
    }
    return res.ok
  } catch (error) {
    console.error('sendCustomEmail failed:', error instanceof Error ? error.name : 'unknown')
    return false
  }
}

/** Send custom SMS via Twilio */
export async function sendCustomSms(to: string, text: string): Promise<boolean> {
  const env = notifyEnv()
  const sid = env.twilioAccountSid?.trim()
  const token = env.twilioAuthToken?.trim()
  const from = env.twilioFrom?.trim()
  if (!sid || !token || !from || !to) return false
  const cleanTo = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`
  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: cleanTo, From: from, Body: text }).toString(),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('sendCustomSms_rejected', res.status, detail.slice(0, 300))
    }
    return res.ok
  } catch (error) {
    console.error('sendCustomSms failed:', error instanceof Error ? error.name : 'unknown')
    return false
  }
}

/** Sends real-time SMS and Email alert every time someone visits an information entry page. */
export async function notifyPageVisit(page: string, ip?: string): Promise<void> {
  const env = notifyEnv()
  const time = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
  const ipNote = ip ? ` (IP: ${ip})` : ''
  const text = `👀 Power Genie Alert: A visitor just entered ${page}${ipNote} at ${time} CT. Be ready for an incoming consultation!`
  const subject = `👀 Power Genie Alert: Visitor entered ${page}`

  // 1. Send SMS to all configured team numbers
  const sid = env.twilioAccountSid?.trim()
  const token = env.twilioAuthToken?.trim()
  const from = env.twilioFrom?.trim()
  const recipients = splitList(env.notifySmsTo).filter((phone) => /^\+[1-9]\d{7,14}$/.test(phone))
  if (sid && token && from && recipients.length > 0) {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64')
    await Promise.allSettled(
      recipients.map((to) =>
        fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
          method: 'POST',
          headers: {
            authorization: `Basic ${auth}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
        })
      )
    )
  }

  // 2. Send Email to all configured team emails
  const key = env.resendApiKey?.trim()
  const notifyFrom = env.notifyFrom?.trim()
  const emailRecipients = splitList(env.notifyEmailTo).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  if (key && notifyFrom && emailRecipients.length > 0) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: emailRecipients,
        subject,
        text,
      }),
    }).catch(() => {})
  }
}
