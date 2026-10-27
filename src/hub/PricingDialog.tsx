import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PricingSettings } from '../../shared/workflow';
import { lockPageScroll } from '../lib/scrollLock';
import { Button, Notice, Spinner, inputClass, labelClass } from './ui';
import { announceWorkflowChange, workflowApi } from './workflowApi';

type NumberKey = {
  [K in keyof PricingSettings]: PricingSettings[K] extends number | null ? K : never;
}[keyof PricingSettings];

type TextKey = 'planName' | 'batteryName' | 'advisorName' | 'advisorPhone' | 'advisorEmail';

function NumberField({ id, label, hint, value, onChange, step = 'any', required }: {
  id: string;
  label: string;
  hint?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}{required && <span className="text-hub-danger"> *</span>}</label>
      <input
        id={id}
        className={inputClass}
        inputMode="decimal"
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
      {hint && <p className="m-0 mt-1 text-[0.78rem] text-hub-soft">{hint}</p>}
    </div>
  );
}

export default function PricingDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const base = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [googleReady, setGoogleReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => lockPageScroll(), []);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);
  useEffect(() => {
    workflowApi.settings()
      .then((result) => { setPricing(result.pricing); setGoogleReady(result.googleReady); })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const setNumber = (key: NumberKey) => (value: number | null) => setPricing((current) => current && { ...current, [key]: value });
  const setText = (key: TextKey) => (event: React.ChangeEvent<HTMLInputElement>) => setPricing((current) => current && { ...current, [key]: event.target.value });

  const save = async () => {
    if (!pricing) return;
    if (pricing.ppaRateCents == null || pricing.ppaEscalatorPct == null) {
      setError('Enter the plan rate and its yearly increase (0 if it is fixed). Proposals wait for both.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await workflowApi.saveSettings(pricing);
      announceWorkflowChange();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-hub-scrim p-3 sm:items-center" onClick={() => { if (!saving) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-hub-surface p-5 text-hub-ink shadow-2xl outline-none"
      >
        <h2 id={titleId} className="m-0 text-lg font-bold">Proposal pricing</h2>
        <p className="mt-1 text-[0.9rem] leading-relaxed text-hub-soft">
          Defaults for every proposal. Horace can change any of them on a single lead. Proposals are estimates; Sunrun's agreement sets the final price.
        </p>
        {!pricing && !error && <div className="py-8 text-center text-hub-soft"><Spinner /></div>}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        {pricing && (
          <div className="mt-4 grid gap-4">
            <fieldset className="grid gap-3 rounded-2xl border border-hub-line p-4">
              <legend className="px-1 text-sm font-bold">Sunrun plan</legend>
              <div>
                <label htmlFor={`${base}-plan`} className={labelClass}>Plan name on the proposal</label>
                <input id={`${base}-plan`} className={inputClass} value={pricing.planName} onChange={setText('planName')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <NumberField id={`${base}-rate`} label="Rate (¢ per kWh)" value={pricing.ppaRateCents} onChange={setNumber('ppaRateCents')} required hint="Year-one price per kWh the panels make." />
                <NumberField id={`${base}-esc`} label="Yearly increase (%)" value={pricing.ppaEscalatorPct} onChange={setNumber('ppaEscalatorPct')} required hint="0 for a fixed rate." />
                <NumberField id={`${base}-term`} label="Term (years)" value={pricing.termYears} onChange={setNumber('termYears')} step="1" />
              </div>
            </fieldset>
            <fieldset className="grid gap-3 rounded-2xl border border-hub-line p-4">
              <legend className="px-1 text-sm font-bold">Battery</legend>
              <label className="flex items-center gap-2 text-[0.92rem] font-semibold">
                <input type="checkbox" className="h-4 w-4" checked={pricing.includeBattery} onChange={(event) => setPricing({ ...pricing, includeBattery: event.target.checked })} />
                Include a battery by default
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${base}-bat`} className={labelClass}>Battery</label>
                  <input id={`${base}-bat`} className={inputClass} value={pricing.batteryName} onChange={setText('batteryName')} />
                </div>
                <NumberField id={`${base}-batfee`} label="Battery add-on ($ a month)" value={pricing.batteryMonthlyAdder} onChange={setNumber('batteryMonthlyAdder')} hint="0 if it is included in the rate." />
              </div>
            </fieldset>
            <fieldset className="grid gap-3 rounded-2xl border border-hub-line p-4">
              <legend className="px-1 text-sm font-bold">Consultant on the proposal</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={`${base}-adv`} className={labelClass}>Name</label>
                  <input id={`${base}-adv`} className={inputClass} value={pricing.advisorName} onChange={setText('advisorName')} />
                </div>
                <div>
                  <label htmlFor={`${base}-advp`} className={labelClass}>Phone</label>
                  <input id={`${base}-advp`} className={inputClass} value={pricing.advisorPhone} onChange={setText('advisorPhone')} />
                </div>
                <div>
                  <label htmlFor={`${base}-adve`} className={labelClass}>Email</label>
                  <input id={`${base}-adve`} className={inputClass} value={pricing.advisorEmail} onChange={setText('advisorEmail')} />
                </div>
              </div>
            </fieldset>
            <button type="button" className="justify-self-start text-[0.88rem] font-semibold text-hub-link hover:underline" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
              {advanced ? 'Hide' : 'Show'} utility and panel assumptions
            </button>
            {advanced && (
              <fieldset className="grid gap-3 rounded-2xl border border-hub-line p-4">
                <legend className="px-1 text-sm font-bold">Assumptions</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField id={`${base}-urate`} label="Utility rate when the bill has none (¢)" value={pricing.utilityRateCents} onChange={setNumber('utilityRateCents')} />
                  <NumberField id={`${base}-uesc`} label="Utility yearly increase (%)" value={pricing.utilityEscalatorPct} onChange={setNumber('utilityEscalatorPct')} />
                  <NumberField id={`${base}-exp`} label="Credit for power sent to the grid (¢)" value={pricing.exportCreditCents} onChange={setNumber('exportCreditCents')} hint="Texas buyback plans vary." />
                  <NumberField id={`${base}-min`} label="Minimum monthly bill ($)" value={pricing.minMonthlyBill} onChange={setNumber('minMonthlyBill')} />
                  <NumberField id={`${base}-self1`} label="Solar used at home, with battery (%)" value={pricing.selfUsePctWithBattery} onChange={setNumber('selfUsePctWithBattery')} />
                  <NumberField id={`${base}-self0`} label="Solar used at home, no battery (%)" value={pricing.selfUsePctWithoutBattery} onChange={setNumber('selfUsePctWithoutBattery')} />
                  <NumberField id={`${base}-watts`} label="Panel size (W)" value={pricing.panelWatts} onChange={setNumber('panelWatts')} step="5" />
                  <NumberField id={`${base}-offset`} label="Target share of usage (%)" value={pricing.targetOffsetPct} onChange={setNumber('targetOffsetPct')} />
                  <NumberField id={`${base}-prod`} label="kWh per kW a year, no roof data" value={pricing.productionKwhPerKw} onChange={setNumber('productionKwhPerKw')} />
                  <NumberField id={`${base}-loss`} label="System losses (%)" value={pricing.dcToAcLossPct} onChange={setNumber('dcToAcLossPct')} />
                  <NumberField id={`${base}-deg`} label="Panel output loss per year (%)" value={pricing.degradationPct} onChange={setNumber('degradationPct')} />
                </div>
              </fieldset>
            )}
            {!googleReady && (
              <Notice tone="info" title="Roof layouts are off">
                Proposals are sized from usage until a Google Maps API key (Solar API, Geocoding and Maps Static turned on) is saved on Vercel as GOOGLE_MAPS_API_KEY.
              </Notice>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancel</Button>
          <Button type="button" variant="accent" onClick={() => void save()} disabled={saving || !pricing} className="w-full sm:w-auto">
            {saving ? <Spinner className="h-4 w-4" /> : 'Save pricing'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
