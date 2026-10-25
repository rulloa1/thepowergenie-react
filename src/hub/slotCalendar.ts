// Civil-date helpers for the booking calendar.
//
// Availability is not decided here. The booking page already receives open
// 1-hour slots (weekdays, Central hours, notice, and busy time). A day is
// selectable only when one of those slots falls on that Central date.

export interface MonthPoint {
  year: number;
  month: number; // 1-12
}

export interface CalendarCell {
  key: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}

export const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Weekday of a calendar date, 0 = Sunday. This is the civil date, not an instant. */
export function weekdayIndex(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function shiftMonth(point: MonthPoint, delta: number): MonthPoint {
  const index = point.year * 12 + (point.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month };
}

export function compareMonth(a: MonthPoint, b: MonthPoint) {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function monthPointFromKey(key: string): MonthPoint {
  const { year, month } = parseDateKey(key);
  return { year, month };
}

export function monthRangeFromKeys(keys: string[]): { min: MonthPoint; max: MonthPoint } | null {
  if (keys.length === 0) return null;
  const sorted = [...keys].sort();
  return {
    min: monthPointFromKey(sorted[0]),
    max: monthPointFromKey(sorted[sorted.length - 1]),
  };
}

/** Keep a date inside the first day of `min` through the last day of `max`. */
export function clampDateKey(key: string, min: MonthPoint, max: MonthPoint) {
  const minKey = dateKey(min.year, min.month, 1);
  const maxKey = dateKey(max.year, max.month, daysInMonth(max.year, max.month));
  if (key < minKey) return minKey;
  if (key > maxKey) return maxKey;
  return key;
}

export function clampMonth(point: MonthPoint, min: MonthPoint, max: MonthPoint): MonthPoint {
  if (compareMonth(point, min) < 0) return min;
  if (compareMonth(point, max) > 0) return max;
  return point;
}

export function shiftDateKey(key: string, deltaDays: number) {
  const { year, month, day } = parseDateKey(key);
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return dateKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function moveDateKey(key: string, deltaDays: number, min: MonthPoint, max: MonthPoint) {
  return clampDateKey(shiftDateKey(key, deltaDays), min, max);
}

/** Sunday or Saturday of the week containing `key`, clamped to the open month range. */
export function weekEdge(key: string, edge: 'start' | 'end', min: MonthPoint, max: MonthPoint) {
  const { year, month, day } = parseDateKey(key);
  const weekday = weekdayIndex(year, month, day);
  const delta = edge === 'start' ? -weekday : 6 - weekday;
  return moveDateKey(key, delta, min, max);
}

/** Six Sunday-start weeks, including the leading and trailing days around the month. */
export function monthGrid(point: MonthPoint): CalendarCell[] {
  const lead = weekdayIndex(point.year, point.month, 1);
  const start = new Date(Date.UTC(point.year, point.month - 1, 1 - lead));
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getTime() + i * 86_400_000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    cells.push({
      key: dateKey(year, month, day),
      day,
      inMonth: year === point.year && month === point.month,
    });
  }
  return cells;
}

export function monthTitle(point: MonthPoint) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(point.year, point.month - 1, 1)));
}

/** "Monday, October 26" for a YYYY-MM-DD key. */
export function formatCivilDate(key: string) {
  const { year, month, day } = parseDateKey(key);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
