import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('the Vercel SPA rewrite serves /privacy and /terms', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    rewrites: { source: string; destination: string }[]
  }
  const spa = vercel.rewrites.find(rule => rule.destination === '/index.html' && rule.source.includes('(?!api/)'))
  assert.ok(spa, 'expected a catch-all rewrite to /index.html that skips /api')
  const pattern = new RegExp(`^${spa.source}$`)
  assert.equal(pattern.test('/privacy'), true)
  assert.equal(pattern.test('/terms'), true)
  assert.equal(pattern.test('/book'), true)
  assert.equal(pattern.test('/api/book'), false)
  assert.equal(pattern.test('/api/google/callback'), false)

  const main = readFileSync('src/main.tsx', 'utf8')
  assert.match(main, /path === '\/privacy'/)
  assert.match(main, /path === '\/terms'/)
  assert.match(main, /LegalFooter/)
  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /LegalFooter homeChrome/)
  assert.match(app, /srep=\/powergenie/)
  assert.match(app, /horace\.lawrence@sunrun\.com/)

  const privacy = readFileSync('src/pages/PrivacyPage.tsx', 'utf8')
  for (const name of [
    'BOOKING_FIELDS_SENTENCE',
    'SMT_CONSENT_SENTENCE',
    'ASSISTANT_OPENAI_SENTENCE',
    'GOOGLE_CALENDAR_USE',
    'GOOGLE_NOT_SOLD',
    'GOOGLE_LIMITED_USE',
    'DELETION_SENTENCE',
  ]) {
    assert.match(privacy, new RegExp(name))
  }
  const terms = readFileSync('src/pages/TermsPage.tsx', 'utf8')
  assert.match(terms, /NO_SAVINGS_GUARANTEE/)
  assert.match(terms, /SUNRUN_SEPARATE/)
})
