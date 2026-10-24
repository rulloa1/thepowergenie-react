import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('the Vercel SPA rewrite serves /privacy and /terms', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
    redirects: { source: string; destination: string; permanent: boolean }[]
    rewrites: { source: string; destination: string }[]
  }

  for (const [source, destination] of [
    ['/node/book', '/book'],
    ['/node/book/', '/book'],
    ['/node/dashboard', '/dashboard'],
    ['/node/dashboard/', '/dashboard'],
  ] as const) {
    const redirect = vercel.redirects.find(rule => rule.source === source)
    assert.equal(redirect?.destination, destination, source)
    assert.equal(redirect?.permanent, true, source)
  }

  for (const source of ['/privacy', '/terms']) {
    const rule = vercel.rewrites.find(item => item.source === source)
    assert.equal(rule?.destination, '/index.html', source)
  }

  const spa = vercel.rewrites.find(rule => rule.destination === '/index.html' && rule.source.includes('(?!api/'))
  assert.ok(spa, 'expected a catch-all rewrite to /index.html that skips /api')
  const explicitFirst = vercel.rewrites.findIndex(rule => rule.source === '/privacy')
  const catchAll = vercel.rewrites.findIndex(rule => rule.source === spa.source)
  assert.ok(explicitFirst >= 0 && explicitFirst < catchAll, 'explicit legal rewrites come before the catch-all')

  const pattern = new RegExp(`^${spa.source}$`)
  assert.equal(pattern.test('/privacy'), true)
  assert.equal(pattern.test('/terms'), true)
  assert.equal(pattern.test('/book'), true)
  assert.equal(pattern.test('/brands'), true)
  assert.equal(pattern.test('/brands/'), true)
  assert.equal(pattern.test('/celebrity-solar'), true)
  assert.equal(pattern.test('/hip-hop-solar'), true)
  assert.equal(pattern.test('/gas-genie'), true)
  assert.equal(pattern.test('/api/book'), false)
  assert.equal(pattern.test('/api/google/callback'), false)
  assert.equal(pattern.test('/brand-lockups/celebrity-solar-lockup.webp'), false)
  assert.equal(pattern.test('/brand-lockups/hip-hop-solar-lockup.webp'), false)
  assert.equal(pattern.test('/brand-lockups/gas-genie-icon.png'), false)
  assert.equal(pattern.test('/brand-lockups'), false)
  assert.equal(pattern.test('/assets/brand/power-genie-lockup.webp'), true)

  const main = readFileSync('src/main.tsx', 'utf8')
  assert.match(main, /sitePage\(path\) === 'privacy'/)
  assert.match(main, /sitePage\(path\) === 'terms'/)
  assert.match(main, /legacyNodeRedirect/)
  assert.doesNotMatch(main, /pages\/BookPage/)
  assert.doesNotMatch(main, /pages\/DashboardPage/)
  assert.match(main, /LegalFooter/)

  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /LegalFooter homeChrome/)
  assert.match(app, /srep=\/powergenie/)
  assert.match(app, /horace\.lawrence@sunrun\.com/)

  const brands = readFileSync('src/components/BrandPage.tsx', 'utf8')
  assert.match(brands, /Our brands/)
  assert.match(brands, /status: 'Coming soon'/)
  assert.match(brands, /href="\/brands"/)
  assert.match(brands, /href="\/celebrity-solar"/)
  assert.match(brands, /href="\/hip-hop-solar"/)
  assert.match(brands, /href="\/gas-genie"/)
  assert.doesNotMatch(brands, /aria-disabled/)
  assert.doesNotMatch(brands, /cursor-not-allowed/)

  const scroll = readFileSync('src/components/ScrollWorld.tsx', 'utf8')
  assert.match(scroll, /href="\/brands"/)
  assert.doesNotMatch(scroll, /Coming soon/)
  assert.doesNotMatch(scroll, /aria-disabled/)
  assert.doesNotMatch(scroll, /cursor-not-allowed/)

  assert.match(app, /marketingViewFromLocation/)
  assert.match(app, /onNavigateBrands/)

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
  assert.match(terms, /BOOKING_REQUEST_SENTENCE/)
  assert.match(terms, /NO_SAVINGS_GUARANTEE/)
  assert.match(terms, /SUNRUN_SEPARATE/)
})
