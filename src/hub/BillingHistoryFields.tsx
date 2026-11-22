import { useState } from 'react';
import { billingMonths, previousBillingMonth } from '../../supabase/functions/_shared/billing-months';
import { inputClass } from './ui';

export default function BillingHistoryFields() {
  const [end, setEnd] = useState(previousBillingMonth);
  return <details className="my-3 rounded-xl border p-3">
    <summary className="cursor-pointer font-bold">Enter monthly electricity use (kWh)</summary>
    <p>Use the values on your bill or utility account. Leave unknown months blank.</p>
    <label>Most recent billing month<input type="month" className={inputClass} value={end} onChange={e => setEnd(e.target.value)} /></label>
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{billingMonths(end).map(month =>
      <label key={month}>{month}<input name={'usage-' + month} className={inputClass} type="number" min="0" max="1000000" step="any" inputMode="decimal" /></label>)}</div>
  </details>;
}
