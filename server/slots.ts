import { loadSlotRules, type SlotRules } from './slot-rules.js'
import type { Slot } from '../shared/types.js'

export type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const bag: Record<string, string> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') bag[part.type] = part.value
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  }
}

/** Milliseconds to add to UTC to get the zone's wall clock. Chicago is negative. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - instant.getTime()
}

export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const first = guess - zoneOffsetMs(new Date(guess), timeZone)
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone))
}

export function isoWithOffset(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone)
  const offsetMinutes = Math.round(zoneOffsetMs(instant, timeZone) / 60000)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  const minutes = String(absolute % 60).padStart(2, '0')
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:00${sign}${hours}:${minutes}`
}

export function chicagoDate(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function addCalendarDays(year: number, month: number, day: number, amount: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + amount))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}

function weekdayIndex(year: number, month: number, day: number, timeZone: string): number {
  const noon = zonedToUtc(year, month, day, 12, 0, timeZone)
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(noon)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[name] ?? 0
}

function hoursFor(weekday: number, rules: SlotRules): { start: number; end: number } | null {
  if (!rules.openWeekdays.includes(weekday)) return null
  if (weekday === 6) return { start: rules.saturdayStartHour, end: rules.saturdayEndHour }
  return { start: rules.weekdayStartHour, end: rules.weekdayEndHour }
}

export type BusyInterval = { start: string; end: string }

/** Half-open overlap: a block that ends exactly when the slot starts does not block it. */
export function overlapsSlot(startIso: string, durationMinutes: number, busy: ReadonlyArray<BusyInterval>): boolean {
  const start = Date.parse(startIso)
  if (!Number.isFinite(start)) return false
  const end = start + durationMinutes * 60_000
  return busy.some(interval => {
    const blockStart = Date.parse(interval.start)
    const blockEnd = Date.parse(interval.end)
    return Number.isFinite(blockStart) && Number.isFinite(blockEnd) && blockStart < end && blockEnd > start
  })
}

export function listSlots(rules: SlotRules, now: Date, taken: ReadonlySet<string>, busy: ReadonlyArray<BusyInterval> = []): Slot[] {
  const today = zonedParts(now, rules.timeZone)
  const earliest = now.getTime() + rules.minLeadHours * 60 * 60 * 1000
  const slots: Slot[] = []
  for (let offset = 0; offset <= rules.horizonDays; offset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, offset)
    const weekday = weekdayIndex(date.year, date.month, date.day, rules.timeZone)
    const hours = hoursFor(weekday, rules)
    if (!hours) continue
    const startMin = hours.start * 60
    const endMin = hours.end * 60
    for (let minute = startMin; minute + rules.durationMinutes <= endMin; minute += rules.durationMinutes) {
      const start = zonedToUtc(date.year, date.month, date.day, Math.floor(minute / 60), minute % 60, rules.timeZone)
      if (start.getTime() < earliest) continue
      const end = new Date(start.getTime() + rules.durationMinutes * 60 * 1000)
      const startIso = isoWithOffset(start, rules.timeZone)
      if (taken.has(startIso) || overlapsSlot(startIso, rules.durationMinutes, busy)) continue
      const day = new Intl.DateTimeFormat('en-US', {
        timeZone: rules.timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(start)
      const timeStart = new Intl.DateTimeFormat('en-US', {
        timeZone: rules.timeZone,
        hour: 'numeric',
        minute: '2-digit',
      }).format(start)
      const timeEnd = new Intl.DateTimeFormat('en-US', {
        timeZone: rules.timeZone,
        hour: 'numeric',
        minute: '2-digit',
      }).format(end)
      const time = `${timeStart}–${timeEnd} CT`
      slots.push({ start: startIso, day, time, label: `${day} · ${time}` })
    }
  }
  return slots
}

export function slotsFromEnv(now = new Date(), taken: ReadonlySet<string> = new Set()): Slot[] {
  return listSlots(loadSlotRules(), now, taken)
}
