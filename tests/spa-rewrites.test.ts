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

  for (const [source, destination] of [
    ['/privacy', '/privacy.html'],
    ['/privacy/', '/privacy.html'],
    ['/terms', '/terms.html'],
    ['/terms/', '/terms.html'],
  ] as const) {
    const rule = vercel.rewrites.find(item => item.source === source)
    assert.equal(rule?.destination, destination, source)
    assert.equal(destination.endsWith('.html'), true, source)
    assert.equal(destination.includes('/api/'), false, source)
  }

  const spa = vercel.rewrites.find(rule => rule.destination === '/index.html' && rule.source.includes('(?!api/'))
  assert.ok(spa, 'expected a catch-all rewrite to /index.html that skips /api')
  const explicitFirst = vercel.rewrites.findIndex(rule => rule.source === '/privacy')
  const catchAll = vercel.rewrites.findIndex(rule => rule.source === spa.source)
  assert.ok(explicitFirst >= 0 && explicitFirst < catchAll, 'explicit legal rewrites come before the catch-all')

  for (const source of ['/assets/bills', '/assets/bills/:path*', '/assets/plans', '/assets/plans/:path*']) {
    const rule = vercel.rewrites.find(item => item.source === source)
    assert.equal(rule?.destination, '/api/not-found', source)
    const index = vercel.rewrites.findIndex(item => item.source === source)
    assert.ok(index >= 0 && index < catchAll, `${source} is handled before the SPA catch-all`)
  }

  const pattern = new RegExp(`^${spa.source}$`)
  assert.equal(pattern.test('/privacy'), true)
  assert.equal(pattern.test('/terms'), true)
  assert.equal(pattern.test('/book'), true)
  assert.equal(pattern.test('/dashboard'), true)
  assert.equal(pattern.test('/dashboard/'), true)
  assert.equal(pattern.test('/dashboard/chat'), true)
  assert.equal(pattern.test('/dashboard/files'), true)
  assert.equal(pattern.test('/dashboard/schedule'), true)
  assert.equal(pattern.test('/pipeline'), true)
  assert.equal(pattern.test('/hub'), true)
  assert.equal(pattern.test('/hub/leads'), true)
  assert.equal(pattern.test('/brands'), true)
  assert.equal(pattern.test('/brands/'), true)
  assert.equal(pattern.test('/celebrity-solar'), true)
  assert.equal(pattern.test('/hip-hop-solar'), true)
  assert.equal(pattern.test('/gas-genie'), true)
  assert.equal(pattern.test('/homeowner'), true)
  assert.equal(pattern.test('/portal'), true)
  assert.equal(pattern.test('/referrals'), true)
  assert.equal(pattern.test('/celebrity-solar.html'), true)
  assert.equal(pattern.test('/api/book'), false)
  assert.equal(pattern.test('/api/google/callback'), false)
  assert.equal(pattern.test('/brand-lockups/celebrity-solar-lockup.webp'), false)
  assert.equal(pattern.test('/brand-lockups/hip-hop-solar-lockup.webp'), false)
  assert.equal(pattern.test('/brand-lockups/gas-genie-icon.png'), false)
  assert.equal(pattern.test('/brand-lockups'), false)
  assert.equal(pattern.test('/assets/brand/power-genie-lockup.webp'), true)
  assert.equal(pattern.test('/assets/bills/patricia-ferrell-entergy-bill.png'), false)
  assert.equal(pattern.test('/assets/plans/patricia-ferrell-solar-plan.jpg'), false)
  assert.equal(pattern.test('/assets/plans/patricia-ferrell-footprint-plan.jpg'), false)
  assert.equal(pattern.test('/assets/bills'), false)
  assert.equal(pattern.test('/assets/plans'), false)

  const main = readFileSync('src/main.tsx', 'utf8')
  assert.match(main, /sitePage\(path\) === 'privacy'/)
  assert.match(main, /sitePage\(path\) === 'terms'/)
  assert.match(main, /sitePage\(path\) === 'homeowner'/)
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
  assert.doesNotMatch(scroll, /href="\/homeowner"/)
  assert.doesNotMatch(scroll, /href="\/dashboard"/)
  assert.doesNotMatch(scroll, /Coming soon/)
  assert.doesNotMatch(scroll, /aria-disabled/)
  assert.doesNotMatch(scroll, /cursor-not-allowed/)

  assert.match(app, /marketingViewFromLocation/)
  assert.match(app, /onNavigateBrands/)
  assert.match(app, /referralBrandFromLocation/)
  assert.doesNotMatch(app, /href="\/homeowner"/)
  assert.doesNotMatch(app, /href="\/dashboard"/)

  const privacy = readFileSync('src/pages/PrivacyPage.tsx', 'utf8')
  for (const name of [
    'BOOKING_FIELDS_SENTENCE',
    'COLLECTED_INFORMATION_SENTENCE',
    'INFORMATION_USE_SENTENCE',
    'SECURITY_SENTENCE',
    'SMS_NO_SHARE_SENTENCE',
    'SMS_OPT_OUT_SENTENCE',
    'SMT_CONSENT_SENTENCE',
    'ASSISTANT_OPENAI_SENTENCE',
    'GOOGLE_CALENDAR_USE',
    'GOOGLE_NOT_SOLD',
    'GOOGLE_LIMITED_USE',
    'DELETION_SENTENCE',
    'OPERATOR_SENTENCE',
  ]) {
    assert.match(privacy, new RegExp(name))
  }
  const terms = readFileSync('src/pages/TermsPage.tsx', 'utf8')
  assert.match(terms, /BOOKING_REQUEST_SENTENCE/)
  assert.match(terms, /NO_SAVINGS_GUARANTEE/)
  assert.match(terms, /SUNRUN_SEPARATE/)
  assert.match(terms, /SMS_PROGRAM_NAME/)
  assert.match(terms, /SMS_PROGRAM_DESCRIPTION/)
  assert.match(terms, /SMS_FREQUENCY/)
  assert.match(terms, /SMS_RATES/)
  assert.match(terms, /SMS_STOP_HELP/)
  assert.match(terms, /SMS_CARRIER_LIABILITY/)
  assert.match(terms, /href="\/privacy"/)

  const footer = readFileSync('src/components/LegalFooter.tsx', 'utf8')
  assert.match(footer, /href="\/privacy">Privacy Policy/)
  assert.match(footer, /href="\/terms">Terms/)
})
