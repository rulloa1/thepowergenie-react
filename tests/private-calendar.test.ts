import assert from 'node:assert/strict'
import { test } from 'node:test'
import { privateCalendar } from '../shared/private-calendar.js'

test('personal calendar export contains only UTC busy blocks, without customer details', () => {
  const period = { start: '2026-11-20T09:00:00-06:00', end: '2026-11-20T10:00:00-06:00', customer_name: 'Private Customer', address: 'Private Address', note: 'Secret notes' }
  const calendar = privateCalendar([period, period, { start: 'invalid', end: 'invalid' }, { start: period.end, end: period.start }], new Date('2026-11-20T00:00:00Z'))
  assert.equal(calendar.match(/BEGIN:VEVENT/g)?.length, 1)
  assert.match(calendar, /DTSTART:20261120T150000Z/)
  assert.match(calendar, /DTEND:20261120T160000Z/)
  assert.match(calendar, /SUMMARY:Busy/)
  assert.match(calendar, /CLASS:PRIVATE/)
  assert.doesNotMatch(calendar, /Private Customer|Private Address|Secret notes|Power Genie|ATTENDEE|ORGANIZER|LOCATION/i)
  assert.ok(calendar.endsWith('END:VCALENDAR\r\n'))
})
