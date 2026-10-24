import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSlotRules } from '../server/slot-rules'
import { listSlots } from '../server/slots'
import { generateSlots } from '../supabase/functions/_shared/slots'

const rules = loadSlotRules({})

function hoursOn(starts: string[], day: string): number[] {
  return starts.filter(start => start.startsWith(day)).map(start => Number(start.slice(11, 13)))
}

test('defaults match the booking page with no env vars', () => {
  assert.equal(rules.timeZone, 'America/Chicago')
  assert.equal(rules.durationMinutes, 60)
  assert.equal(rules.weekdayStartHour, 9)
  assert.equal(rules.weekdayEndHour, 20)
  assert.equal(rules.minLeadHours, 1)
  assert.equal(rules.horizonDays, 30)
  assert.deepEqual(rules.openWeekdays, [1, 2, 3, 4, 5])
})

test('offers hourly weekday slots from 9 AM through 7 PM and skips the weekend', () => {
  const now = new Date('2026-10-22T15:00:00.000Z') // Thursday 10:00 AM CDT
  const slots = listSlots(rules, now, new Set())
  const starts = slots.map(slot => slot.start)
  assert.deepEqual(hoursOn(starts, '2026-10-22'), [11, 12, 13, 14, 15, 16, 17, 18, 19])
  assert.deepEqual(hoursOn(starts, '2026-10-23'), [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  assert.equal(starts.some(start => start.startsWith('2026-10-24')), false)
  assert.equal(starts.some(start => start.startsWith('2026-10-25')), false)
  const monday = slots.find(slot => slot.start.startsWith('2026-11-02T09:00:00'))
  assert.equal(monday?.start, '2026-11-02T09:00:00-06:00')
  assert.match(monday?.label || '', /9:00 AM–10:00 AM CT$/)
})

test('assistant-offered slots are the same instants as /book', () => {
  const moments = [
    '2026-10-22T15:00:00.000Z',
    '2026-10-26T14:30:00.000Z', // Monday 9:30 AM CDT
    '2026-10-26T14:00:00.000Z', // Monday 9:00 AM CDT
    '2026-10-26T23:05:00.000Z', // Monday 6:05 PM CDT
    '2026-10-26T01:00:00.000Z', // Sunday 8:00 PM CDT
    '2026-10-26T13:00:00.000Z', // Monday 8:00 AM CDT, 30-day edge
    '2026-02-10T14:00:00.000Z', // Tuesday 8:00 AM CST, spans the spring-forward
  ]
  for (const iso of moments) {
    const now = new Date(iso)
    const assistant = listSlots(rules, now, new Set()).map(slot => Date.parse(slot.start))
    const book = generateSlots(now).map(slot => Date.parse(slot.start))
    assert.deepEqual(assistant, book, iso)
  }
})

test('hides only the hour a one-hour hub appointment covers', () => {
  const now = new Date('2026-10-22T15:00:00.000Z')
  const busy = [{ start: '2026-10-23T15:00:00.000Z', end: '2026-10-23T16:00:00.000Z' }]
  const slots = listSlots(rules, now, new Set(), busy)
  assert.equal(slots.some(slot => slot.start === '2026-10-23T09:00:00-05:00'), true)
  assert.equal(slots.some(slot => slot.start === '2026-10-23T10:00:00-05:00'), false)
  assert.equal(slots.some(slot => slot.start === '2026-10-23T11:00:00-05:00'), true)
})

test('hides a slot that is already booked', () => {
  const now = new Date('2026-10-22T15:00:00.000Z')
  const slots = listSlots(rules, now, new Set(['2026-10-23T09:00:00-05:00']))
  assert.equal(slots.some(slot => slot.start === '2026-10-23T09:00:00-05:00'), false)
})

test('rejects an impossible hour range', () => {
  assert.throws(() => loadSlotRules({ SLOT_WEEKDAY_START: '18', SLOT_WEEKDAY_END: '9' }))
})
