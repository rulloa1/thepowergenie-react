import { describe, expect, it } from 'vitest';
import {
  generateSlots,
  isBookableSlot,
  localParts,
  zonedTimeToUtc,
  SLOT_TIME_ZONE,
  type Slot,
} from '../../supabase/functions/_shared/slots';

const TZ = SLOT_TIME_ZONE;
/** UTC Date for a Central wall-clock time. */
const central = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(zonedTimeToUtc(y, m, d, h, min, TZ));
const local = (iso: string) => localParts(new Date(iso).getTime(), TZ);
const onDay = (slots: Slot[], y: number, m: number, d: number) =>
  slots.filter((s) => {
    const p = local(s.start);
    return p.year === y && p.month === m && p.day === d;
  });

// Mon 26 Oct 2026 is in daylight time (CDT, UTC-5); Mon 2 Nov 2026 is standard time (CST, UTC-6).
const SUNDAY_NIGHT = central(2026, 10, 25, 20); // Sun 25 Oct, 8 PM

describe('hours', () => {
  it('offers on-the-hour starts from 9 AM to 7 PM Central (11 per weekday)', () => {
    const slots = onDay(generateSlots(SUNDAY_NIGHT), 2026, 10, 26);
    expect(slots.map((s) => local(s.start).hour)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    for (const s of slots) {
      expect(local(s.start).minute).toBe(0);
      expect(new Date(s.end).getTime() - new Date(s.start).getTime()).toBe(60 * 60 * 1000);
    }
    expect(local(slots.at(-1)!.end).hour).toBe(20); // last slot ends at 8 PM
  });

  it('converts Central time correctly across daylight saving time', () => {
    expect(central(2026, 10, 26, 9).toISOString()).toBe('2026-10-26T14:00:00.000Z'); // CDT
    expect(central(2026, 11, 2, 9).toISOString()).toBe('2026-11-02T15:00:00.000Z'); // CST
    const nov2 = onDay(generateSlots(SUNDAY_NIGHT), 2026, 11, 2);
    expect(nov2[0].start).toBe('2026-11-02T15:00:00.000Z');
    expect(nov2).toHaveLength(11);
  });
});

describe('weekdays', () => {
  it('never offers Saturday or Sunday', () => {
    const slots = generateSlots(SUNDAY_NIGHT);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect([1, 2, 3, 4, 5]).toContain(local(s.start).weekday);
    expect(onDay(slots, 2026, 10, 31)).toHaveLength(0); // Saturday
    expect(onDay(slots, 2026, 11, 1)).toHaveLength(0); // Sunday
  });
});

describe('1-hour notice', () => {
  it('hides slots that start less than an hour from now', () => {
    const now = central(2026, 10, 26, 9, 30); // Mon 9:30 AM
    const today = onDay(generateSlots(now), 2026, 10, 26);
    expect(local(today[0].start).hour).toBe(11); // 10:00 is only 30 minutes away
  });

  it('allows a slot exactly one hour away', () => {
    const now = central(2026, 10, 26, 9);
    expect(local(onDay(generateSlots(now), 2026, 10, 26)[0].start).hour).toBe(10);
    expect(isBookableSlot(central(2026, 10, 26, 10), now)).toBe(true);
  });

  it('rejects a slot inside the notice window at booking time (server re-check)', () => {
    const now = central(2026, 10, 26, 9, 1);
    expect(isBookableSlot(central(2026, 10, 26, 10), now)).toBe(false);
  });

  it('shows nothing for today after 6 PM', () => {
    const now = central(2026, 10, 26, 18, 5);
    expect(onDay(generateSlots(now), 2026, 10, 26)).toHaveLength(0);
  });
});

describe('busy time', () => {
  const now = SUNDAY_NIGHT;

  it('removes a slot fully covered by a busy block', () => {
    const busy = [{ start: central(2026, 10, 26, 13), end: central(2026, 10, 26, 14) }];
    const hours = onDay(generateSlots(now, busy), 2026, 10, 26).map((s) => local(s.start).hour);
    expect(hours).not.toContain(13);
    expect(hours).toContain(12);
    expect(hours).toContain(14);
  });

  it('removes a slot that only partly overlaps (e.g. a 15-minute phone event)', () => {
    const busy = [{ start: central(2026, 10, 26, 10, 30), end: central(2026, 10, 26, 10, 45) }];
    const hours = onDay(generateSlots(now, busy), 2026, 10, 26).map((s) => local(s.start).hour);
    expect(hours).not.toContain(10);
    expect(hours).toContain(11);
  });

  it('removes every slot touched by a long busy block', () => {
    const busy = [{ start: central(2026, 10, 26, 11, 15), end: central(2026, 10, 26, 14, 5) }];
    const hours = onDay(generateSlots(now, busy), 2026, 10, 26).map((s) => local(s.start).hour);
    expect(hours).toEqual([9, 10, 15, 16, 17, 18, 19]);
  });

  it('does not block a slot when busy time only touches its edges', () => {
    const busy = [
      { start: central(2026, 10, 26, 9), end: central(2026, 10, 26, 10) },
      { start: central(2026, 10, 26, 11), end: central(2026, 10, 26, 12) },
    ];
    const hours = onDay(generateSlots(now, busy), 2026, 10, 26).map((s) => local(s.start).hour);
    expect(hours).toContain(10);
    expect(hours).not.toContain(9);
    expect(hours).not.toContain(11);
  });

  it('accepts ISO strings from the Google free/busy API', () => {
    const busy = [{ start: '2026-10-26T19:00:00Z', end: '2026-10-26T20:00:00Z' }]; // 2–3 PM CDT
    expect(isBookableSlot(central(2026, 10, 26, 14), now, busy)).toBe(false);
    expect(isBookableSlot(central(2026, 10, 26, 15), now, busy)).toBe(true);
  });

  it('ignores malformed busy entries instead of crashing', () => {
    const busy = [{ start: 'nonsense', end: 'nope' }, { start: central(2026, 10, 26, 12), end: central(2026, 10, 26, 11) }];
    expect(onDay(generateSlots(now, busy), 2026, 10, 26)).toHaveLength(11);
  });
});

describe('30-day limit', () => {
  it('never offers a slot more than 30 days out', () => {
    const now = central(2026, 10, 26, 8);
    const limit = now.getTime() + 30 * 24 * 3600 * 1000;
    const slots = generateSlots(now);
    for (const s of slots) expect(new Date(s.start).getTime()).toBeLessThanOrEqual(limit);
    const last = local(slots.at(-1)!.start);
    // 30 days after Mon 26 Oct 8 AM is Wed 25 Nov 8 AM → last slot is Tue 24 Nov, 7 PM.
    expect([last.month, last.day, last.hour]).toEqual([11, 24, 19]);
  });

  it('rejects a booking 31 days out', () => {
    const now = central(2026, 10, 26, 8);
    expect(isBookableSlot(central(2026, 11, 26, 10), now)).toBe(false);
  });
});

describe('isBookableSlot input checks', () => {
  const now = SUNDAY_NIGHT;
  it('rejects off-the-hour, out-of-hours, weekend and invalid starts', () => {
    expect(isBookableSlot(central(2026, 10, 26, 10, 30), now)).toBe(false);
    expect(isBookableSlot(central(2026, 10, 26, 8), now)).toBe(false);
    expect(isBookableSlot(central(2026, 10, 26, 20), now)).toBe(false);
    expect(isBookableSlot(central(2026, 10, 31, 10), now)).toBe(false);
    expect(isBookableSlot('not a date', now)).toBe(false);
  });
  it('accepts a normal weekday slot', () => {
    expect(isBookableSlot(central(2026, 10, 27, 19).toISOString(), now)).toBe(true);
  });
});
