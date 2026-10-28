import assert from 'node:assert/strict'
import { test } from 'node:test'

// Mock Deno so the Supabase Edge Function can be imported in Node/tsx
// @ts-ignore
globalThis.Deno = { serve: () => {} }

const { parseLaunchLead, serviceAddress, hubRecords, alertText } = await import('../supabase/functions/launch-lead/index.js')

test('Gas Genie lead parses valid input and isolates from solar hub', () => {
  const parsed = parseLaunchLead({
    site: 'gas-genie',
    name: 'Morgan Davis',
    email: 'morgan@example.com',
    zip: '77002',
    consent: true,
    pageUrl: 'https://thepowergenie.com/gas-genie.html',
  })

  assert.notEqual(parsed, 'honeypot')
  if (parsed !== 'honeypot') {
    assert.equal(parsed.site, 'gas-genie')
    assert.equal(parsed.name, 'Morgan Davis')
    assert.equal(parsed.email, 'morgan@example.com')
    assert.equal(parsed.zip, '77002')
    assert.equal(parsed.phone, null)
    assert.equal(parsed.address, null)
    assert.equal(parsed.billRange, null)

    const alert = alertText(parsed, false)
    assert.match(alert, /New Gas Genie lead/)
    assert.match(alert, /Morgan Davis/)
    assert.match(alert, /morgan@example\.com/)
    assert.match(alert, /ZIP: 77002/)
    assert.match(alert, /Leads table:/)
  }
})

test('Gas Genie lead rejects missing consent, invalid email, or invalid zip', () => {
  assert.throws(
    () => parseLaunchLead({ site: 'gas-genie', name: 'Morgan', email: 'm@example.com', zip: '77002', consent: false }),
    /Please check the consent box\./,
  )
  assert.throws(
    () => parseLaunchLead({ site: 'gas-genie', name: 'M', email: 'm@example.com', zip: '77002', consent: true }),
    /Please enter your name\./,
  )
  assert.throws(
    () => parseLaunchLead({ site: 'gas-genie', name: 'Morgan', email: 'invalid-email', zip: '77002', consent: true }),
    /Please enter your email\./,
  )
  assert.throws(
    () => parseLaunchLead({ site: 'gas-genie', name: 'Morgan', email: 'm@example.com', zip: '770', consent: true }),
    /Please enter a 5-digit ZIP code\./,
  )
})

test('Solar launch page leads parse valid inputs and generate hub records', () => {
  const sites = [
    { site: 'hip-hop-solar', choice: 'H-Town Legend' },
    { site: 'celebrity-solar', choice: 'Surprise me' },
    { site: 'sport-and-solar', choice: 'Basketball' },
  ] as const

  for (const { site, choice } of sites) {
    const parsed = parseLaunchLead({
      site,
      name: 'Jordan Miller',
      phone: '(832) 555-0199',
      email: 'jordan@example.com',
      address: '1420 Skyline Blvd',
      zip: '77008',
      bill: '150-200',
      choice,
      consent: true,
      pageUrl: `https://thepowergenie.com/${site}.html`,
    })

    assert.notEqual(parsed, 'honeypot')
    if (parsed !== 'honeypot') {
      assert.equal(parsed.site, site)
      assert.equal(parsed.name, 'Jordan Miller')
      assert.equal(parsed.phone, '(832) 555-0199')
      assert.equal(parsed.email, 'jordan@example.com')
      assert.equal(parsed.billRange, '$150-$200')
      assert.equal(parsed.choice, choice)

      const fullAddr = serviceAddress(parsed)
      assert.equal(fullAddr, '1420 Skyline Blvd, TX 77008')

      const now = new Date('2026-10-28T12:00:00Z')
      const { customer, activity } = hubRecords(parsed, 'lead-1234', now)
      assert.equal(customer.stage, 'bill_received')
      assert.equal(customer.customer_name, 'Jordan Miller')
      assert.equal(customer.service_address, '1420 Skyline Blvd, TX 77008')
      assert.match(customer.notes, new RegExp(`Referral source: ${site}`))
      assert.match(customer.notes, new RegExp(`Picked: ${choice}`))
      assert.match(customer.notes, /Electric bill: \$150-\$200/)
      assert.match(customer.notes, /TCPA consent: yes/)

      assert.equal(activity.customer_id, 'lead-1234')
      assert.match(activity.message, /Monthly bill \$150-\$200/)

      const alert = alertText(parsed, true)
      assert.match(alert, /Jordan Miller/)
      assert.match(alert, /\(832\) 555-0199/)
      assert.match(alert, /1420 Skyline Blvd, TX 77008/)
      assert.match(alert, /Electric bill: \$150-\$200\/mo/)
      assert.match(alert, /Hub: https:\/\/thepowergenie\.theroyeffect\.com\/dashboard\?tab=leads/)
    }
  }
})

test('Solar launch page rejects invalid phone or address without digits', () => {
  assert.throws(
    () =>
      parseLaunchLead({
        site: 'celebrity-solar',
        name: 'Jordan Miller',
        phone: '123',
        email: 'jordan@example.com',
        address: '1420 Skyline Blvd',
        zip: '77008',
        bill: '150-200',
        consent: true,
      }),
    /Please enter your phone number\./,
  )

  assert.throws(
    () =>
      parseLaunchLead({
        site: 'celebrity-solar',
        name: 'Jordan Miller',
        phone: '8325550199',
        email: 'jordan@example.com',
        address: 'Skyline Boulevard',
        zip: '77008',
        bill: '150-200',
        consent: true,
      }),
    /Please enter your home address\./,
  )

  assert.throws(
    () =>
      parseLaunchLead({
        site: 'celebrity-solar',
        name: 'Jordan Miller',
        phone: '8325550199',
        email: 'jordan@example.com',
        address: '1420 Skyline Blvd',
        zip: '77008',
        bill: 'invalid-bill',
        consent: true,
      }),
    /Please pick your monthly electric bill\./,
  )
})

test('Honeypot field flags bot submissions', () => {
  const result = parseLaunchLead({
    site: 'gas-genie',
    name: 'Bot Name',
    email: 'bot@example.com',
    zip: '77002',
    consent: true,
    company: 'Spam Co',
  })
  assert.equal(result, 'honeypot')
})

