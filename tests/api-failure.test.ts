import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpError } from '../server/http'
import { logApiFailure } from '../server/routes'
import { supabaseProjectUrl, supabaseRequest } from '../server/supabase'

test('a placeholder database URL is a 503, not a fetch TypeError', () => {
  assert.equal(supabaseProjectUrl(' "https://ogwiopxnjpwwzleqwobq.supabase.co/" '), 'https://ogwiopxnjpwwzleqwobq.supabase.co')
  assert.equal(supabaseProjectUrl('https://example.supabase.co/rest/v1'), 'https://example.supabase.co')
  assert.throws(() => supabaseProjectUrl('your-project-url'), (error: unknown) => {
    return error instanceof HttpError && error.status === 503 && /https URL/.test(error.message)
  })
  assert.throws(() => supabaseProjectUrl('http://example.supabase.co'), (error: unknown) => error instanceof HttpError)
  assert.equal(supabaseProjectUrl('http://127.0.0.1:9'), 'http://127.0.0.1:9')
  assert.equal(supabaseProjectUrl('http://db.test'), 'http://db.test')
})

test('fetch TypeError from a bad address becomes a database 503', async () => {
  await assert.rejects(supabaseRequest('not a url'), (error: unknown) => {
    return error instanceof HttpError && error.status === 503 && /could not reach Supabase/i.test(error.message)
  })
})

test('api_failed logs the message and stack and hides the secret', () => {
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map((part) => String(part)).join(' '))
  }
  try {
    const error = new TypeError('Failed to parse URL from https://bad.example using sb_secret_supersecretkey')
    error.stack = 'TypeError: Failed to parse URL\n    at requireHubMember (server/hub-member.ts:24:21)'
    logApiFailure(error)
  } finally {
    console.error = original
  }
  const text = lines.join('\n')
  assert.match(text, /api_failed TypeError Failed to parse URL/)
  assert.match(text, /requireHubMember/)
  assert.equal(text.includes('sb_secret_supersecretkey'), false)
  assert.match(text, /sb_secret_\[redacted\]/)
})
