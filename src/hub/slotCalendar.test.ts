import { describe, expect, it } from 'vitest';
import { generateSlots, zonedTimeToUtc, SLOT_TIME_ZONE } from '../../supabase/functions/_shared/slots';
import { centralDateKey } from './time';
import {
  clampDateKey,
  daysInMonth,
  formatCivilDate,
  monthGrid,
  monthRangeFromKeys,
  moveDateKey,
  shiftDateKey,
  shiftMonth,
  weekEdge,
  weekdayIndex,
} from './slotCalendar';

const oct = { year: 2026, month: 10 };
const nov = { year: 2026, month: 11 };

describe('slot calendar', () => {
  it('builds a Sunday-start month that contains October 2026', () => {
    expect(weekdayIndex(2026, 10, 1)).toBe(4); // Thursday
    expect(daysInMonth(2026, 10)).toBe(31);
    const cells = monthGrid(oct);
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe('2026-09-27');
    expect(cells[0].inMonth).toBe(false);
    expect(cells[4]).toMatchObject({ key: '2026-10-01', day: 1, inMonth: true });
    expect(cells[34]).toMatchObject({ key: '2026-10-31', day: 31, inMonth: true });
    expect(cells[35]).toMatchObject({ key: '2026-11-01', inMonth: false });
  });

  it('moves across month and year boundaries by civil date, including the DST weekend', () => {
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDateKey('2026-03-08', 1)).toBe('2026-03-09');
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it('clamps keyboard moves to the months that have open days', () => {
    expect(moveDateKey('2026-10-01', -1, oct, nov)).toBe('2026-10-01');
    expect(moveDateKey('2026-11-30', 1, oct, nov)).toBe('2026-11-30');
    expect(moveDateKey('2026-10-31', 1, oct, nov)).toBe('2026-11-01');
    expect(clampDateKey('2026-09-15', oct, nov)).toBe('2026-10-01');
    expect(weekEdge('2026-10-01', 'start', oct, nov)).toBe('2026-10-01');
    expect(weekEdge('2026-10-26', 'start', oct, nov)).toBe('2026-10-25');
    expect(weekEdge('2026-10-26', 'end', oct, nov)).toBe('2026-10-31');
  });

  it('names dates and spans only the months present in the slot keys', () => {
    expect(formatCivilDate('2026-10-26')).toBe('Monday, October 26');
    expect(monthRangeFromKeys(['2026-11-02', '2026-10-26'])).toEqual({
      min: { year: 2026, month: 10 },
      max: { year: 2026, month: 11 },
    });
    expect(monthRangeFromKeys([])).toBeNull();
  });

  it('enables a day only when the existing slot list has that Central date', () => {
    // Sunday 25 Oct 2026, 8 PM Central — same window the slot rules already use.
    const now = new Date(zonedTimeToUtc(2026, 10, 25, 20, 0, SLOT_TIME_ZONE));
    const open = new Set(generateSlots(now).map((slot) => centralDateKey(slot.start)));
    const october = monthGrid(oct).filter((cell) => cell.inMonth);
    const enabled = october.filter((cell) => open.has(cell.key)).map((cell) => cell.key);

    expect(enabled).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    expect(open.has('2026-10-31')).toBe(false); // Saturday
    expect(open.has('2026-11-01')).toBe(false); // Sunday
    // 7 PM Central is the next UTC date. The calendar key stays on the Central day.
    const sevenPm = new Date(zonedTimeToUtc(2026, 10, 26, 19, 0, SLOT_TIME_ZONE)).toISOString();
    expect(sevenPm.startsWith('2026-10-27')).toBe(true);
    expect(centralDateKey(sevenPm)).toBe('2026-10-26');
    expect(open.has('2026-10-26')).toBe(true);
  });
});
