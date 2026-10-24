import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fieldsFromExtractPayload, normalizeBill } from '../supabase/functions/_shared/bill'

test('normalizes ESI ID, meter, TDU, PUCT certificate, and usage history', () => {
  const bill = normalizeBill({
    esiid: '1044 3720 0123 45678',
    meterNumber: ' mtr-100 ',
    tdu: '  CenterPoint Energy ',
    repPuctCertificate: 'PUCT #10094',
    avgMonthlyKwh: '1,050',
    usageHistory: [
      { month: '2026-09', kwh: '1,100' },
      { month: '2026-13', kwh: 10 },
      { month: '2026-07', kwh: 1550 },
      { month: '2026-07', kwh: 1600 },
    ],
  })
  assert.equal(bill.esiid, '10443720012345678')
  assert.equal(bill.meterNumber, 'mtr-100')
  assert.equal(bill.tdu, 'CenterPoint Energy')
  assert.equal(bill.repPuctCertificate, '10094')
  assert.equal(bill.avgMonthlyKwh, 1050)
  assert.deepEqual(bill.usageHistory, [
    { month: '2026-07', kwh: 1600 },
    { month: '2026-09', kwh: 1100 },
  ])
  assert.deepEqual(normalizeBill(bill), bill)
})

test('drops ESI IDs and certificates that are the wrong length', () => {
  assert.equal(normalizeBill({ esiid: '12345' }).esiid, null)
  assert.equal(normalizeBill({ esiid: '1'.repeat(16) }).esiid, null)
  assert.equal(normalizeBill({ esiid: '1'.repeat(23) }).esiid, null)
  assert.equal(normalizeBill({ esiid: '1'.repeat(22) }).esiid, '1'.repeat(22))
  assert.equal(normalizeBill({ repPuctCertificate: '12' }).repPuctCertificate, null)
  assert.equal(normalizeBill({ usageHistory: [] }).usageHistory, null)
  assert.equal(normalizeBill({ usageHistory: 'not a chart' }).usageHistory, null)
  assert.equal(normalizeBill({ avgMonthlyKwh: -4 }).avgMonthlyKwh, null)
})

test('reads the extractor payload and ignores anything else', () => {
  const fields = fieldsFromExtractPayload({ fields: { esiid: '1044-3720-0123-45678', kwhThisPeriod: 900 } })
  assert.equal(fields?.esiid, '10443720012345678')
  assert.equal(fields?.kwhThisPeriod, 900)
  assert.equal(fieldsFromExtractPayload(null), null)
  assert.equal(fieldsFromExtractPayload({ warning: 'nope' }), null)
})
