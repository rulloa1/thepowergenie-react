import assert from 'node:assert/strict'
import { test } from 'node:test'
import { powerGenieEmail } from '../shared/hub-access.js'
import { handleHubAccess } from '../server/hub-access.js'

test('Power Genie access matches valid emails anywhere, ignoring case', () => {
  assert.equal(powerGenieEmail('Horace.ThePowerGenie@gmail.com'), true)
  assert.equal(powerGenieEmail('horace@thepowergenie.com'), true)
  for (const email of ['someone@gmail.com', 'thepowergenie', 'power genie@gmail.com', 'powergenie@@gmail.com']) {
    assert.equal(powerGenieEmail(email), false)
  }
})

test('access requires a verified matching email and never accepts a posted email', async () => {
  process.env.SUPABASE_URL = 'https://access.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'
  const originalFetch = globalThis.fetch
  let writes = 0
  let authUser = { id: '00000000-0000-4000-8000-000000000001', email: 'horace@thepowergenie.com', email_confirmed_at: '' }
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/auth/v1/user')) return Response.json(authUser)
    writes++
    assert.equal(JSON.parse(String(init?.body)).role, 'owner')
    return new Response(null, { status: 201 })
  }
  const request = () => new Request('https://site.test/api/assistant?route=hub-access', { method: 'POST', headers: { authorization: 'Bearer verified-session' } })
  try {
    await assert.rejects(handleHubAccess(new Request('https://site.test', { headers: { authorization: 'invalid' } })), /sign in first/)
    await assert.rejects(handleHubAccess(request()), /verified Power Genie/)
    assert.equal(writes, 0)
    authUser = { ...authUser, email_confirmed_at: '2026-11-20T00:00:00Z', email: 'other@gmail.com' }
    await assert.rejects(handleHubAccess(request()), /verified Power Genie/)
    assert.equal(writes, 0)
    authUser.email = 'horace@thepowergenie.com'
    assert.equal((await handleHubAccess(request())).status, 200)
    assert.equal(writes, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('matching addresses can prepare an unconfirmed account with closed sign-ups', async () => {
  process.env.SUPABASE_URL = 'https://access.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (input, init) => {
    calls++
    assert.equal(String(input), 'https://access.test/auth/v1/admin/users')
    assert.deepEqual(JSON.parse(String(init?.body)), { email: 'thepowergenie@example.com', email_confirm: false })
    return Response.json({ id: 'new-user' }, { status: 200 })
  }
  const request = (email: string) => new Request('https://site.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  try {
    await assert.rejects(handleHubAccess(request('other@example.com')), /Power Genie email/)
    assert.equal(calls, 0)
    assert.equal((await handleHubAccess(request('ThePowerGenie@example.com'))).status, 200)
    assert.equal(calls, 1)
    globalThis.fetch = async () => Response.json({ code: 'email_exists' }, { status: 422 })
    assert.equal((await handleHubAccess(request('thepowergenie@example.com'))).status, 200)
    globalThis.fetch = async () => Response.json({ code: 'unexpected_failure' }, { status: 422 })
    await assert.rejects(handleHubAccess(request('thepowergenie@example.com')), /Could not prepare/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
