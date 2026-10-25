export const USAGE_PENDING_COPY = 'Usage will sync once Smart Meter Texas access is active';

export type MonthlyRow = { periodStart: string; periodEnd: string; kwh: number };

export function usageStatusCopy(status: string): string {
  if (status === 'pending_setup') return USAGE_PENDING_COPY;
  if (status === 'requested') return 'Waiting on the Smart Meter Texas approval email.';
  if (status === 'approved') return 'Smart Meter Texas approved this meter.';
  if (status === 'expired') return 'This Smart Meter Texas agreement has expired.';
  if (status === 'failed') return 'The meter request did not go through. The call is still booked.';
  return 'Meter status is not available yet.';
}

export type UsageSummary = {
  rows: MonthlyRow[];
  averageKwh: number | null;
  peak: { periodStart: string; kwh: number } | null;
};

export function summarizeMonthly(rows: MonthlyRow[]): UsageSummary {
  const clean = rows
    .filter((row) => Number.isFinite(row.kwh) && row.periodStart)
    .slice()
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .slice(-12);
  if (clean.length === 0) return { rows: [], averageKwh: null, peak: null };
  const total = clean.reduce((sum, row) => sum + row.kwh, 0);
  const peak = clean.reduce((best, row) => (row.kwh > best.kwh ? row : best), clean[0]);
  return {
    rows: clean,
    averageKwh: Math.round((total / clean.length) * 10) / 10,
    peak: { periodStart: peak.periodStart, kwh: peak.kwh },
  };
}

export function monthlyCsv(rows: MonthlyRow[]): string {
  const lines = ['period_start,period_end,kwh'];
  for (const row of summarizeMonthly(rows).rows) {
    lines.push(`${row.periodStart},${row.periodEnd},${row.kwh}`);
  }
  return lines.join('\n');
}

export function monthLabel(periodStart: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodStart);
  if (!match) return periodStart;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
