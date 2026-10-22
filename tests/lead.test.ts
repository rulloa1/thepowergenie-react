import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildLeadRecords } from '../server/lead'
import { listSlots } from '../server/slots'
import { loadSlotRules } from '../server/slot-rules'
import type { UploadReceipt } from '../server/receipt'

const rules = loadSlotRules({})
const now = new Date('2026-10-22T15:00:00.000Z')
const slot = listSlots(rules, now, new Set()).find(item => item.start === '2026-10-23T09:00:00-05:00')
if (!slot) throw new Error('expected a Friday slot')

const receipt: UploadReceipt = {
  uploadId: '11111111-1111-4111-8111-111111111111',
  path: 'pending/11111111-1111-4111-8111-111111111111/bill.png',
  fileName: 'bill.png',
  mimeType: 'image/png',
  exp: now.getTime() + 60_000,
}

test('builds an unacknowledged bill_received lead for Horace', () => {
  const prepared = buildLeadRecords({
    clientRequestId: '22222222-2222-4222-8222-222222222222',
    name: 'Alex Morgan',
    phone: '713-555-0100',
    email: 'alex@example.com',
    serviceAddress: '456 Oak Lane, Houston, TX 77008',
    utility: 'Entergy Texas',
    preferredWindows: 'weekday mornings',
    referralSource: 'celebrity-solar',
    slot,
    bill: {
      customerName: 'Alex Morgan',
      serviceAddress: '456 Oak Lane, Houston, TX 77008',
      utility: 'Entergy Texas',
      accountNumber: '100200300',
      billDate: '2026-09-20',
      kwhThisPeriod: 1100,
      days: 30,
      currentCharges: 168.4,
      totalDue: 168.4,
      pastDue: 0,
    },
    receipt,
    now,
    timeZone: rules.timeZone,
  })

  assert.equal(prepared.customer.stage, 'bill_received')
  assert.equal(prepared.customer.acknowledged, 0)
  assert.equal(prepared.customer.next_step, 'Horace: run savings calc')
  assert.equal(prepared.customer.appointment_date, '2026-10-23T09:00:00-05:00')
  assert.equal(prepared.customer.next_step_due, '2026-10-23')
  assert.equal(prepared.customer.date_sent_to_horace, '2026-10-22')
  assert.equal(prepared.customer.created_by, null)
  assert.equal(prepared.customer.logged_on, '2026-10-22')
  assert.equal(prepared.customer.avg_kwh_per_day, 36.7)
  assert.equal(prepared.customer.est_cents_per_kwh, 15.309)
  assert.match(String(prepared.customer.notes), /TCPA consent: yes/)
  assert.match(String(prepared.customer.notes), /713-555-0100/)
  assert.doesNotMatch(String(prepared.customer.notes), /transcript|How much does solar/)
  assert.equal(prepared.activity.actor_name, 'Website assistant')
  assert.equal(prepared.activity.actor_id, null)
  assert.match(String(prepared.activity.message), /website assistant/i)
  assert.match(String(prepared.activity.message), /Bill attached/)
  assert.equal(prepared.file?.category, 'light_bill')
  assert.equal(prepared.file?.uploaded_by, null)
  assert.match(String(prepared.file?.storage_path), /^customers\/22222222-2222-4222-8222-222222222222\/light_bill\//)
})

test('a consult with no bill still uses the first pipeline stage', () => {
  const prepared = buildLeadRecords({
    clientRequestId: '33333333-3333-4333-8333-333333333333',
    name: 'Alex Morgan',
    phone: '713-555-0100',
    email: 'alex@example.com',
    serviceAddress: '456 Oak Lane, Houston, TX 77008',
    utility: 'Not provided',
    preferredWindows: '',
    referralSource: null,
    slot,
    bill: {},
    receipt: null,
    now,
    timeZone: rules.timeZone,
  })
  assert.equal(prepared.customer.stage, 'bill_received')
  assert.equal(prepared.file, null)
  assert.match(String(prepared.activity.message), /No bill attached yet/)
  assert.match(String(prepared.customer.notes), /Bill: not attached/)
})
