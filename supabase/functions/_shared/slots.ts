// Appointment slot rules for the Power Genie Referral Hub.
//
// Pure TypeScript with no imports, so the same file runs in Supabase Edge
// Functions (Deno) and in the Vitest unit tests (Node).
//
// Rules:
//   - Weekdays only (Mon–Fri), Central time (America/Chicago).
//   - 1-hour slots on the hour, first start 9:00 AM, last start 7:00 PM
//     (so the last slot ends at 8:00 PM).
//   - A slot must start at least 1 hour from "now".
//   - A slot must start no more than 30 days from "now".
//   - A slot is hidden if it overlaps any busy interval (existing
//     appointments or Google Calendar busy time).

export const SLOT_TIME_ZONE = 'America/Chicago';

export interface SlotRules {
  timeZone: string;
  firstStartHour: number; // local hour of the first slot start
  lastStartHour: number; // local hour of the last slot start
  slotMinutes: number;
  minNoticeMinutes: number;
  daysAhead: number;
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
}

export const DEFAULT_RULES: SlotRules = {
  timeZone: SLOT_TIME_ZONE,
  firstStartHour: 9,
  lastStartHour: 19,
  slotMinutes: 60,
  minNoticeMinutes: 60,
  daysAhead: 30,
  weekdays: [1, 2, 3, 4, 5],
};

export interface Interval {
  start: Date | string | number;
  end: Date | string | number;
}

export interface Slot {
  start: string; // ISO 8601 UTC
  end: string; // ISO 8601 UTC
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function toMs(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0-6
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of an instant in a time zone. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** UTC instant (ms) of a wall-clock time in a time zone. DST-safe for business hours. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess, timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = target - asIfUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

function overlaps(aStart: number, aEnd: number, busy: { s: number; e: number }[]) {
  // Half-open intervals: a busy block that ends exactly when a slot starts does not block it.
  return busy.some((b) => b.s < aEnd && b.e > aStart);
}

function normalizeBusy(busy: Interval[]) {
  return busy
    .map((b) => ({ s: toMs(b.start), e: toMs(b.end) }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s);
}

/** Every candidate slot (ignores busy time) within the booking window. */
function candidateSlots(nowMs: number, rules: SlotRules): number[] {
  const earliest = nowMs + rules.minNoticeMinutes * MINUTE;
  const latest = nowMs + rules.daysAhead * DAY;
  const today = localParts(nowMs, rules.timeZone);
  const out: number[] = [];
  // Walk calendar dates in local time. Noon UTC of each date avoids DST edge cases.
  const base = Date.UTC(today.year, today.month - 1, today.day, 12);
  for (let d = 0; d <= rules.daysAhead + 1; d++) {
    const date = new Date(base + d * DAY);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const weekday = date.getUTCDay();
    if (!rules.weekdays.includes(weekday)) continue;
    for (let h = rules.firstStartHour; h <= rules.lastStartHour; h++) {
      const start = zonedTimeToUtc(y, m, day, h, 0, rules.timeZone);
      if (start < earliest || start > latest) continue;
      out.push(start);
    }
  }
  return out;
}

/** Open slots, sorted by start time. */
export function generateSlots(
  now: Date | number,
  busy: Interval[] = [],
  rules: SlotRules = DEFAULT_RULES,
): Slot[] {
  const nowMs = toMs(now);
  const blocks = normalizeBusy(busy);
  const len = rules.slotMinutes * MINUTE;
  return candidateSlots(nowMs, rules)
    .filter((s) => !overlaps(s, s + len, blocks))
    .map((s) => ({ start: new Date(s).toISOString(), end: new Date(s + len).toISOString() }));
}

/** Server-side re-check: is this exact start time bookable right now? */
export function isBookableSlot(
  start: Date | string | number,
  now: Date | number,
  busy: Interval[] = [],
  rules: SlotRules = DEFAULT_RULES,
): boolean {
  const startMs = toMs(start);
  if (!Number.isFinite(startMs)) return false;
  const nowMs = toMs(now);
  if (!candidateSlots(nowMs, rules).includes(startMs)) return false;
  return !overlaps(startMs, startMs + rules.slotMinutes * MINUTE, normalizeBusy(busy));
}

/**
 * Website-assistant consults stored as a start time. Each one blocks
 * `durationMinutes` (the assistant slot length, 120 by default) so a
 * one-hour /book slot that falls inside that window is hidden.
 */
export function leadIntervals(
  appointmentDates: Array<string | null | undefined>,
  timeMin: string,
  timeMax: string,
  durationMinutes: number,
): { start: string; end: string }[] {
  const windowStart = toMs(timeMin)
  const windowEnd = toMs(timeMax)
  const duration = durationMinutes * MINUTE
  const out: { start: string; end: string }[] = []
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || duration <= 0) return out
  for (const value of appointmentDates) {
    if (!value) continue
    const start = toMs(value)
    if (!Number.isFinite(start)) continue
    const end = start + duration
    if (start < windowEnd && end > windowStart) {
      out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
    }
  }
  return out
}

/** The time range the server must check for busy time before listing slots. */
export function bookingWindow(now: Date | number, rules: SlotRules = DEFAULT_RULES) {
  const nowMs = toMs(now);
  return {
    timeMin: new Date(nowMs).toISOString(),
    timeMax: new Date(nowMs + rules.daysAhead * DAY + rules.slotMinutes * MINUTE).toISOString(),
  };
}
