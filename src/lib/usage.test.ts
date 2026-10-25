import { describe, expect, it } from 'vitest';
import { USAGE_PENDING_COPY, monthlyCsv, summarizeMonthly, usageStatusCopy } from './usage';

describe('summarizeMonthly', () => {
  it('averages the months and names the peak', () => {
    const summary = summarizeMonthly([
      { periodStart: '2026-06-01', periodEnd: '2026-07-01', kwh: 900 },
      { periodStart: '2026-07-01', periodEnd: '2026-08-01', kwh: 1500 },
      { periodStart: '2026-08-01', periodEnd: '2026-09-01', kwh: 1600 },
    ]);
    expect(summary.averageKwh).toBe(1333.3);
    expect(summary.peak).toEqual({ periodStart: '2026-08-01', kwh: 1600 });
    expect(monthlyCsv(summary.rows)).toContain('2026-08-01,2026-09-01,1600');
  });

  it('uses the pending setup sentence when Smart Meter Texas is not connected yet', () => {
    expect(usageStatusCopy('pending_setup')).toBe(USAGE_PENDING_COPY);
  });
});
