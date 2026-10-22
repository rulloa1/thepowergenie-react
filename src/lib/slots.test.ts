import { describe, expect, it } from 'vitest';
import {
  calendarWeekday,
  chicagoParts,
  clipBusyRanges,
  generateOpenSlots,
  zonedWallTimeToUtc,
} from './slots';

const HOUR_MS = 60 * 60 * 1000;

describe('Chicago wall time', () => {
  it('knows 22 October 2026 is a Thursday', () => {
    expect(calendarWeekday(2026, 10, 22)).toBe(4);
  });

  it('maps 9 AM and 7 PM through daylight saving and standard time', () => {
    expect(zonedWallTimeToUtc(2026, 10, 28, 9, 0).toISOString()).toBe('2026-10-28T14:00:00.000Z');
    expect(zonedWallTimeToUtc(2026, 10, 28, 19, 0).toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(zonedWallTimeToUtc(2027, 1, 6, 9, 0).toISOString()).toBe('2027-01-06T15:00:00.000Z');
    expect(zonedWallTimeToUtc(2027, 1, 6, 19, 0).toISOString()).toBe('2027-01-07T01:00:00.000Z');
  });
});

describe('generateOpenSlots', () => {
  const thursdayMorning = new Date('2026-10-22T12:00:00.000Z');

  it('offers 9 AM through 7 PM on the hour, and not 8 AM or 8 PM', () => {
    const slots = generateOpenSlots({ now: thursdayMorning, busy: [] });
    const thursday = slots.filter((slot) => {
      const parts = chicagoParts(slot);
      return parts.year === 2026 && parts.month === 10 && parts.day === 22;
    });

    expect(thursday.map((slot) => chicagoParts(slot).hour)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(thursday.every((slot) => chicagoParts(slot).minute === 0)).toBe(true);
    expect(slots.some((slot) => chicagoParts(slot).hour === 8 || chicagoParts(slot).hour === 20)).toBe(false);
    expect(thursday[0]?.toISOString()).toBe('2026-10-22T14:00:00.000Z');
    expect(thursday[thursday.length - 1]?.toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });

  it('skips Saturday and Sunday', () => {
    const slots = generateOpenSlots({ now: thursdayMorning, busy: [] });
    expect(slots.every((slot) => {
      const weekday = chicagoParts(slot).weekday;
      return weekday !== 0 && weekday !== 6;
    })).toBe(true);
    expect(slots.some((slot) => {
      const parts = chicagoParts(slot);
      return parts.month === 10 && (parts.day === 24 || parts.day === 25);
    })).toBe(false);

    const saturdayMorning = new Date('2026-10-24T13:00:00.000Z');
    const fromWeekend = generateOpenSlots({ now: saturdayMorning, busy: [] });
    expect(fromWeekend[0]?.toISOString()).toBe(zonedWallTimeToUtc(2026, 10, 26, 9, 0).toISOString());
  });

  it('hides a slot that starts in less than one hour and keeps one that starts in exactly one hour', () => {
    const exactlyOneHour = generateOpenSlots({ now: new Date('2026-10-22T13:00:00.000Z'), busy: [] });
    expect(exactlyOneHour.some((slot) => slot.toISOString() === '2026-10-22T14:00:00.000Z')).toBe(true);

    const fiftyNineMinutes = generateOpenSlots({ now: new Date('2026-10-22T13:01:00.000Z'), busy: [] });
    expect(fiftyNineMinutes.some((slot) => slot.toISOString() === '2026-10-22T14:00:00.000Z')).toBe(false);
    expect(fiftyNineMinutes.some((slot) => slot.toISOString() === '2026-10-22T15:00:00.000Z')).toBe(true);

    const thirtyMinutes = generateOpenSlots({ now: new Date('2026-10-22T13:30:00.000Z'), busy: [] });
    expect(thirtyMinutes.some((slot) => slot.toISOString() === '2026-10-22T14:00:00.000Z')).toBe(false);
    expect(thirtyMinutes.some((slot) => slot.toISOString() === '2026-10-22T15:00:00.000Z')).toBe(true);
  });

  it('drops slots that overlap a busy range and keeps a slot that only touches one', () => {
    const nine = zonedWallTimeToUtc(2026, 10, 22, 9, 0);
    const ten = zonedWallTimeToUtc(2026, 10, 22, 10, 0);
    const eleven = zonedWallTimeToUtc(2026, 10, 22, 11, 0);

    const covered = generateOpenSlots({
      now: thursdayMorning,
      busy: [{ start: nine, end: ten }],
    });
    expect(covered.some((slot) => slot.getTime() === nine.getTime())).toBe(false);
    expect(covered.some((slot) => slot.getTime() === ten.getTime())).toBe(true);

    const touching = generateOpenSlots({
      now: thursdayMorning,
      busy: [{ start: new Date(nine.getTime() - HOUR_MS), end: nine }],
    });
    expect(touching.some((slot) => slot.getTime() === nine.getTime())).toBe(true);

    const straddling = generateOpenSlots({
      now: thursdayMorning,
      busy: [{
        start: new Date(nine.getTime() + 30 * 60 * 1000),
        end: new Date(ten.getTime() + 30 * 60 * 1000),
      }],
    });
    expect(straddling.some((slot) => slot.getTime() === nine.getTime())).toBe(false);
    expect(straddling.some((slot) => slot.getTime() === ten.getTime())).toBe(false);
    expect(straddling.some((slot) => slot.getTime() === eleven.getTime())).toBe(true);

    const inside = generateOpenSlots({
      now: thursdayMorning,
      busy: [{
        start: new Date(nine.getTime() + 10 * 60 * 1000),
        end: new Date(nine.getTime() + 20 * 60 * 1000),
      }],
    });
    expect(inside.some((slot) => slot.getTime() === nine.getTime())).toBe(false);
  });

  it('stops at 30 days ahead', () => {
    const slots = generateOpenSlots({ now: thursdayMorning, busy: [] });
    const latest = thursdayMorning.getTime() + 30 * 24 * HOUR_MS;
    expect(slots.every((slot) => slot.getTime() <= latest)).toBe(true);
    expect(slots.some((slot) => slot.toISOString() === '2026-11-20T15:00:00.000Z')).toBe(true);
    expect(slots.some((slot) => {
      const parts = chicagoParts(slot);
      return parts.month === 11 && parts.day === 23;
    })).toBe(false);
  });
});

describe('clipBusyRanges', () => {
  const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 22, hour, minute, 0));

  it('removes the portion already covered by an appointment and keeps the rest', () => {
    expect(clipBusyRanges(
      [{ start: at(14), end: at(16) }],
      [{ start: at(14), end: at(15) }],
    )).toEqual([{ start: at(15), end: at(16) }]);
  });

  it('keeps a busy range that only touches an appointment', () => {
    expect(clipBusyRanges(
      [{ start: at(14), end: at(15) }],
      [{ start: at(15), end: at(16) }],
    )).toEqual([{ start: at(14), end: at(15) }]);
  });

  it('drops a leftover shorter than a minute', () => {
    expect(clipBusyRanges(
      [{ start: at(14), end: at(16) }],
      [{ start: at(14), end: new Date(at(16).getTime() - 30 * 1000) }],
    )).toEqual([]);
  });
});
