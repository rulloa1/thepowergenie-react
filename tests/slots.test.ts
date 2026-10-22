import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hubConsultRanges, rangesOverlap } from '../server/hub-busy'
import { loadSlotRules } from '../server/slot-rules'
import { listSlots } from '../server/slots'

const rules = loadSlotRules({})

test('offers weekday and Saturday slots in Chicago and skips Sunday', () => {
  const now = new Date('2026-10-22T15:00:00.000Z')
  const slots = listSlots(rules, now, new Set())
  const thursday = slots.filter(slot => slot.start.startsWith('2026-10-22'))
  assert.deepEqual(thursday.map(slot => slot.start), [
    '2026-10-22T13:00:00-05:00',
    '2026-10-22T15:00:00-05:00',
  ])
  assert.ok(slots.some(slot => slot.start === '2026-10-23T09:00:00-05:00'))
  assert.deepEqual(
    slots.filter(slot => slot.start.startsWith('2026-10-24')).map(slot => slot.start),
    ['2026-10-24T10:00:00-05:00', '2026-10-24T12:00:00-05:00'],
  )
  assert.equal(slots.some(slot => slot.start.startsWith('2026-10-25')), false)
  const monday = slots.find(slot => slot.start.startsWith('2026-11-02T09:00:00'))
  assert.equal(monday?.start, '2026-11-02T09:00:00-06:00')
  assert.match(monday?.label || '', /CT$/)
})

test('hides a slot that is already booked', () => {
  const now = new Date('2026-10-22T15:00:00.000Z')
  const slots = listSlots(rules, now, new Set(['2026-10-23T09:00:00-05:00']))
  assert.equal(slots.some(slot => slot.start === '2026-10-23T09:00:00-05:00'), false)
})

test('rejects an impossible hour range', () => {
  assert.throws(() => loadSlotRules({ SLOT_WEEKDAY_START: '18', SLOT_WEEKDAY_END: '9' }))
})

test('a hub consult blocks the same hours on the calendar', () => {
  const from = new Date('2026-10-23T12:00:00.000Z')
  const to = new Date('2026-10-30T12:00:00.000Z')
  const ranges = hubConsultRanges(['2026-10-23T10:00:00-05:00', 'not-a-date', null], 120 * 60 * 1000, from, to)
  assert.equal(ranges.length, 1)
  assert.equal(rangesOverlap(new Date('2026-10-23T15:30:00.000Z'), new Date('2026-10-23T16:30:00.000Z'), ranges), true)
  assert.equal(rangesOverlap(new Date('2026-10-23T17:00:00.000Z'), new Date('2026-10-23T18:00:00.000Z'), ranges), false)
})
