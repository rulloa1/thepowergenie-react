export function privateCalendar(periods: { start: string; end: string }[], now = new Date()): string {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Personal Calendar//Availability//EN', 'CALSCALE:GREGORIAN'];
  const seen = new Set<string>();
  for (const period of periods) {
    const start = new Date(period.start);
    const end = new Date(period.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue;
    const uid = `${start.getTime()}-${end.getTime()}@availability.local`;
    if (seen.has(uid)) continue;
    seen.add(uid);
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, 'SUMMARY:Busy', 'CLASS:PRIVATE', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].join('\r\n');
}
