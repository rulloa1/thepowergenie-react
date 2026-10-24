import { localParts, SLOT_TIME_ZONE, zonedTimeToUtc } from '../../supabase/functions/_shared/slots';

export const TZ = SLOT_TIME_ZONE;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
const dayFmt = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const shortDayFmt = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const dateTimeFmt = fmt({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const formatDay = (iso: string | Date) => dayFmt.format(new Date(iso));
export const formatShortDay = (iso: string | Date) => shortDayFmt.format(new Date(iso));
export const formatDateTime = (iso: string | Date) => dateTimeFmt.format(new Date(iso));

/** YYYY-MM-DD of an instant in Central time — used to group by day. */
export function centralDateKey(iso: string | Date) {
  const p = localParts(new Date(iso).getTime(), TZ);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "2026-10-26" + "14:30" (Central) → UTC ISO string. */
export function centralToIso(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(zonedTimeToUtc(y, m, d, h, min, TZ)).toISOString();
}

export function todayCentralKey() {
  return centralDateKey(new Date());
}

/** "HH:MM" in Central time, rounded to a 15-minute mark for the schedule controls. */
export function centralTimeValue(iso: string | Date) {
  const p = localParts(new Date(iso).getTime(), TZ);
  const rounded = Math.round(p.minute / 15) * 15;
  const hour = (p.hour + (rounded === 60 ? 1 : 0)) % 24;
  const minute = rounded === 60 ? 0 : rounded;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatBytes(n: number | null | undefined) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
