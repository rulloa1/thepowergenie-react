/** Booking rules shared by the public page, the dashboard, and the serverless API. */

export const BOOKING_TIME_ZONE = 'America/Chicago';

/** 9 AM through 7 PM. A slot starting at 7 PM ends at 8 PM. */
export const SLOT_START_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

export const SLOT_DURATION_MS = 60 * 60 * 1000;
export const MIN_NOTICE_MS = 60 * 60 * 1000;
export const HORIZON_DAYS = 30;

export type BusyRange = {
  start: Date;
  end: Date;
};

export type ChicagoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 is Sunday. */
  weekday: number;
};

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type GenerateSlotsOptions = {
  now: Date;
  busy?: BusyRange[];
  horizonDays?: number;
  minNoticeMs?: number;
  timeZone?: string;
};

export function addCalendarDays(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function calendarWeekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function readWallParts(date: Date, timeZone: string): WallParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const parts = {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
  if (!Object.values(parts).every(Number.isFinite)) {
    throw new Error('Could not read the time zone.');
  }
  return parts;
}

function offsetMs(instantMs: number, timeZone: string): number {
  const parts = readWallParts(new Date(instantMs), timeZone);
  // Hour 24 is passed through; Date.UTC rolls it to the next day.
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallAsUtc - instantMs;
}

export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = BOOKING_TIME_ZONE,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstPass = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - offsetMs(firstPass, timeZone));
}

export function chicagoParts(date: Date, timeZone = BOOKING_TIME_ZONE): ChicagoParts {
  const wall = readWallParts(date, timeZone);
  let { year, month, day, hour } = wall;
  if (hour === 24) {
    hour = 0;
    const next = addCalendarDays(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }
  return {
    year,
    month,
    day,
    hour,
    minute: wall.minute,
    weekday: calendarWeekday(year, month, day),
  };
}

export function chicagoDayRange(year: number, month: number, day: number, timeZone = BOOKING_TIME_ZONE) {
  const start = zonedWallTimeToUtc(year, month, day, 0, 0, timeZone);
  const next = addCalendarDays(year, month, day, 1);
  const end = zonedWallTimeToUtc(next.year, next.month, next.day, 0, 0, timeZone);
  return { start, end };
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function normalizeBusy(busy: BusyRange[]): BusyRange[] {
  const ranges: BusyRange[] = [];
  for (const range of busy) {
    const startMs = range?.start?.getTime?.();
    const endMs = range?.end?.getTime?.();
    if (typeof startMs !== 'number' || typeof endMs !== 'number') continue;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    ranges.push({ start: new Date(startMs), end: new Date(endMs) });
  }
  return ranges;
}

export function generateOpenSlots(options: GenerateSlotsOptions): Date[] {
  const timeZone = options.timeZone ?? BOOKING_TIME_ZONE;
  const horizonDays = options.horizonDays ?? HORIZON_DAYS;
  const minNoticeMs = options.minNoticeMs ?? MIN_NOTICE_MS;
  const earliest = options.now.getTime() + minNoticeMs;
  const latest = options.now.getTime() + horizonDays * 24 * 60 * 60 * 1000;
  const busy = normalizeBusy(options.busy ?? []);
  const today = chicagoParts(options.now, timeZone);
  const slots: Date[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset += 1) {
    const date = addCalendarDays(today.year, today.month, today.day, dayOffset);
    const weekday = calendarWeekday(date.year, date.month, date.day);
    if (weekday === 0 || weekday === 6) continue;

    for (const hour of SLOT_START_HOURS) {
      const start = zonedWallTimeToUtc(date.year, date.month, date.day, hour, 0, timeZone);
      const startMs = start.getTime();
      if (startMs < earliest || startMs > latest) continue;
      const end = new Date(startMs + SLOT_DURATION_MS);
      if (busy.some((range) => rangesOverlap(start, end, range.start, range.end))) continue;
      slots.push(start);
    }
  }

  slots.sort((a, b) => a.getTime() - b.getTime());
  return slots;
}

/** Busy time that is not already explained by one of our appointments. */
export function clipBusyRanges(busy: BusyRange[], covered: BusyRange[]): BusyRange[] {
  let pieces = normalizeBusy(busy);
  for (const cut of normalizeBusy(covered)) {
    pieces = pieces.flatMap((piece) => subtractRange(piece, cut));
  }
  return pieces.filter((piece) => piece.end.getTime() - piece.start.getTime() >= 60 * 1000);
}

function subtractRange(piece: BusyRange, cut: BusyRange): BusyRange[] {
  const pieceStart = piece.start.getTime();
  const pieceEnd = piece.end.getTime();
  const cutStart = cut.start.getTime();
  const cutEnd = cut.end.getTime();
  if (pieceEnd <= cutStart || pieceStart >= cutEnd) return [piece];
  const remaining: BusyRange[] = [];
  if (pieceStart < cutStart) remaining.push({ start: new Date(pieceStart), end: new Date(cutStart) });
  if (pieceEnd > cutEnd) remaining.push({ start: new Date(cutEnd), end: new Date(pieceEnd) });
  return remaining;
}

export function groupSlotsByChicagoDay(slots: Date[]): Array<{ key: string; label: string; slots: Date[] }> {
  const groups: Array<{ key: string; label: string; slots: Date[] }> = [];
  const index = new Map<string, { key: string; label: string; slots: Date[] }>();
  for (const slot of slots) {
    const parts = chicagoParts(slot);
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    let group = index.get(key);
    if (!group) {
      group = { key, label: formatChicagoDay(slot), slots: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.slots.push(slot);
  }
  return groups;
}

export function formatChicagoDay(slot: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BOOKING_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(slot);
}

export function formatChicagoTime(slot: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BOOKING_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(slot);
}
