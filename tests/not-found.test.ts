import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GET, HEAD } from '../api/not-found'

test('removed customer document URLs are a plain 404, not the SPA shell', async () => {
  const get = GET()
  assert.equal(get.status, 404)
  assert.equal(get.headers.get('content-type'), 'text/plain; charset=utf-8')
  assert.equal(get.headers.get('cache-control'), 'no-store')
  const body = await get.text()
  assert.equal(body, 'Not found')
  assert.equal(body.includes('<div id="root"'), false)
  assert.equal(body.includes('<!DOCTYPE html>'), false)

  const head = HEAD()
  assert.equal(head.status, 404)
  assert.equal(await head.text(), '')
})
