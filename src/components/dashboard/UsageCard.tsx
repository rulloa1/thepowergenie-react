import { monthLabel, monthlyCsv, summarizeMonthly, usageStatusCopy, type MonthlyRow } from '../../lib/usage';
import { Button } from '../../hub/ui';

export type CustomerUsage = {
  status: 'pending_setup' | 'requested' | 'approved' | 'expired' | 'failed';
  esiId: string | null;
  rows: MonthlyRow[];
  hasIntervals: boolean;
};

function downloadUsage(rows: MonthlyRow[]) {
  const blob = new Blob([monthlyCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'usage.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function UsageCard({ usage }: { usage: CustomerUsage }) {
  const summary = summarizeMonthly(usage.rows);
  const peak = summary.peak?.kwh ?? 0;
  return (
    <div className="mt-2 rounded-xl border border-hub-line bg-hub-muted px-3 py-3 text-hub-ink">
      <p className="m-0 text-sm font-semibold text-hub-ink">Smart Meter Texas</p>
      <p className="m-0 mt-1 text-sm text-hub-soft">{usageStatusCopy(usage.status)}</p>
      {usage.esiId ? <p className="m-0 text-sm text-hub-soft">ESI ID {usage.esiId}</p> : null}
      {summary.rows.length > 0 ? (
        <>
          <div
            className="mt-3 grid h-32 items-stretch gap-1"
            style={{ gridTemplateColumns: `repeat(${summary.rows.length}, minmax(0, 1fr))` }}
            aria-hidden="true"
          >
            {summary.rows.map((row) => (
              <div key={row.periodStart} className="flex h-full min-w-0 flex-col justify-end" title={`${monthLabel(row.periodStart)} ${row.kwh} kWh`}>
                <div
                  className="min-h-1 w-full rounded-t bg-hub-chart"
                  style={{ height: `${Math.max(8, Math.round((row.kwh / (peak || 1)) * 100))}%` }}
                />
              </div>
            ))}
          </div>
          <p className="m-0 mt-2 text-sm text-hub-ink">
            Average {summary.averageKwh} kWh a month.
            {summary.peak ? ` Peak ${monthLabel(summary.peak.periodStart)} at ${summary.peak.kwh} kWh.` : ''}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-1 pr-3 font-semibold">Month</th>
                  <th className="py-1 font-semibold">kWh</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.periodStart} className="border-t border-hub-line">
                    <td className="py-1 pr-3">{monthLabel(row.periodStart)}</td>
                    <td className="py-1">{row.kwh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="ghost" className="mt-3" onClick={() => downloadUsage(summary.rows)}>
            Download CSV
          </Button>
        </>
      ) : null}
      {usage.hasIntervals ? (
        <p className="m-0 mt-2 text-sm text-hub-soft">15-minute readings are saved for this meter.</p>
      ) : null}
    </div>
  );
}
