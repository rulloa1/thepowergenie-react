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
