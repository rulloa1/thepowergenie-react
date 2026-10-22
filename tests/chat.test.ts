import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { handleApi } from '../server/routes'
import { ASSISTANT_INSTRUCTIONS, mockAiEnabled } from '../server/prompt'
import { supabaseConfig } from '../server/supabase'
import { resetRateLimits } from '../server/rate-limit'

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
  resetRateLimits()
})

test('instructions stay general and do not quote prices', () => {
  assert.match(ASSISTANT_INSTRUCTIONS, /Do not invent or state prices/)
  assert.match(ASSISTANT_INSTRUCTIONS, /Horace Lawrence/)
  assert.doesNotMatch(ASSISTANT_INSTRUCTIONS, /\$\d/)
})

test('mock answers are refused when Supabase is the real project', () => {
  process.env.ASSISTANT_MOCK_AI = '1'
  process.env.SUPABASE_URL = 'https://ogwiopxnjpwwzleqwobq.supabase.co'
  assert.equal(mockAiEnabled(), false)
})

test('chat answers a price question without inventing a number', async () => {
  process.env.ASSISTANT_MOCK_AI = '1'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_only'
  const response = await handleApi(new Request('http://127.0.0.1:3000/api/chat', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3000', 'x-forwarded-for': '203.0.113.20', 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'How much does solar cost per month?' }] }],
    }),
  }))
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.match(text, /Horace/)
  assert.doesNotMatch(text, /\$\d/)
})

test('a filled honeypot does not call the model path for a normal question stream', async () => {
  process.env.ASSISTANT_MOCK_AI = '1'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  const response = await handleApi(new Request('http://127.0.0.1:3000/api/chat', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:3000', 'x-forwarded-for': '203.0.113.21', 'content-type': 'application/json' },
    body: JSON.stringify({
      pg_leave_blank: 'https://spam.example',
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'How much does solar cost?' }] }],
    }),
  }))
  const text = await response.text()
  assert.doesNotMatch(text, /\$\d/)
  assert.match(text, /upload your electric bill|book a free savings consult/i)
})

function roleJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url')
  return `${header}.${payload}.sig`
}

test('the assistant accepts an sb_secret key or a service_role JWT and refuses an anon JWT', () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co/'
  process.env.SUPABASE_SERVICE_ROLE_KEY = '  sb_secret_test_only  '
  assert.deepEqual(supabaseConfig(), { url: 'https://example.supabase.co', key: 'sb_secret_test_only' })
  process.env.SUPABASE_SERVICE_ROLE_KEY = roleJwt('service_role')
  assert.equal(supabaseConfig().key, process.env.SUPABASE_SERVICE_ROLE_KEY)
  process.env.SUPABASE_SERVICE_ROLE_KEY = roleJwt('anon')
  assert.throws(() => supabaseConfig(), /Scheduling is not configured/)
})
