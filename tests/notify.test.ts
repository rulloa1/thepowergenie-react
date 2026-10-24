import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leadAlertText, sendLeadAlert, type LeadAlert, type NotifyEnv } from '../supabase/functions/_shared/notify'

const alert: LeadAlert = {
  id: '22222222-2222-4222-8222-222222222222',
  source: 'assistant',
  name: 'Alex Morgan',
  address: '456 Oak Lane, Houston, TX 77008',
  kwh: 1100,
  amount: 168.4,
  appointment: 'Fri, Oct 23 · 9:00 AM–11:00 AM CT',
  billAttached: true,
  dashboardUrl: 'https://thepowergenie.theroyeffect.com/dashboard?tab=leads&id=22222222-2222-4222-8222-222222222222',
}

const env: NotifyEnv = {
  resendApiKey: 're_test',
  notifyFrom: 'The Power Genie <leads@example.com>',
  notifyEmailTo: 'rory@example.com, horace@example.com',
  twilioAccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  twilioAuthToken: 'token',
  twilioFrom: '+15555550100',
  notifySmsTo: '+17135550100, +17135550101',
}

test('the alert names the homeowner, the bill, and the dashboard link', () => {
  const text = leadAlertText(alert)
  assert.match(text, /Alex Morgan/)
  assert.match(text, /456 Oak Lane/)
  assert.match(text, /1,100 kWh/)
  assert.match(text, /\$168\.40/)
  assert.match(text, /Bill attached: yes/)
  assert.match(text, /tab=leads&id=22222222-2222-4222-8222-222222222222/)
})

test('email uses the lead id as the Resend idempotency key and SMS goes to each number', async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = []
  await sendLeadAlert(alert, env, async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body })
    return { ok: true, status: 200 }
  })
  const email = calls.find(call => call.url.includes('api.resend.com'))
  assert.ok(email)
  assert.equal(email.headers['Idempotency-Key'], alert.id)
  const sent = JSON.parse(email.body) as { to: string[] }
  assert.deepEqual(sent.to, ['rory@example.com', 'horace@example.com'])
  const sms = calls.filter(call => call.url.includes('api.twilio.com'))
  assert.equal(sms.length, 2)
  assert.match(sms[0].body, /To=%2B17135550100/)
  assert.match(sms[1].body, /To=%2B17135550101/)
})

test('missing settings skip that channel and a failed request does not throw', async () => {
  const calls: string[] = []
  await sendLeadAlert(alert, {}, async (url) => {
    calls.push(url)
    return { ok: true, status: 200 }
  })
  assert.equal(calls.length, 0)

  await sendLeadAlert(alert, env, async () => {
    throw new Error('network down')
  })
})
