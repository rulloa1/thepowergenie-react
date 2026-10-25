import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { handleApi } from '../server/routes'
import { resetRateLimits } from '../server/rate-limit'

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
  resetRateLimits()
})

test('a signed-out caller cannot read a bill through the hub route', async () => {
  const response = await handleApi(new Request('http://127.0.0.1:3000/api/assistant?route=hub-bill', {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.61',
    },
    body: JSON.stringify({ fileName: 'bill.png', mimeType: 'image/png', dataBase64: 'aaaa' }),
  }))
  assert.equal(response.status, 401)
  const payload = await response.json() as { error?: string }
  assert.match(payload.error || '', /sign in/i)
})

test('the hub bill route rejects a cross-origin post before reading a session', async () => {
  const response = await handleApi(new Request('http://127.0.0.1:3000/api/hub-bill', {
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
      authorization: 'Bearer not-a-session',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.62',
    },
    body: JSON.stringify({ fileName: 'bill.png', mimeType: 'image/png', dataBase64: 'aaaa' }),
  }))
  assert.equal(response.status, 403)
})
