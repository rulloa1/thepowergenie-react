import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { BillFields } from '../../shared/types';
import { lockPageScroll } from '../lib/scrollLock';
import { readLeadBill } from './leadActions';
import {
  LEAD_STAGES,
  applyBillToDraft,
  draftFromLead,
  emptyDraft,
  type LeadDraft,
  type LeadSnapshot,
} from './leadRecord';
import { Button, Notice, Spinner, inputClass, labelClass } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

export default function LeadForm({
  mode,
  lead,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  lead: LeadSnapshot | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: LeadDraft, file: File | null) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<LeadDraft>(() => (lead ? draftFromLead(lead) : emptyDraft()));
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [billNote, setBillNote] = useState<string | null>(null);

  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = (key: keyof LeadDraft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] || null;
    setFile(next);
    setBillNote(null);
    if (!next) return;
    setReading(true);
    const read = await readLeadBill(next);
    setReading(false);
    if ('error' in read) {
      setBillNote(read.error);
      return;
    }
    setDraft((current) => applyBillToDraft(current, read.fields as BillFields));
    setBillNote(read.warning || 'Numbers filled from the bill. Change anything that looks wrong before saving.');
  };

  const title = mode === 'create' ? 'Add a lead' : 'Edit lead';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-hub-scrim sm:items-center" onClick={() => { if (!busy) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-hub-surface text-hub-ink shadow-2xl outline-none sm:max-h-[92dvh] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hub-line px-4 py-3">
          <div>
            <h2 id={titleId} className="m-0 text-lg font-bold text-hub-ink">{title}</h2>
            <p className="m-0 text-[0.8rem] text-hub-soft">Saved on the customer list. Booking appointments stay on the schedule.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hub-line text-hub-ink hover:border-hub-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onSubmit(draft, file);
          }}
        >
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-4 py-4">
            <Field id="lead-name" label="Name">
              <input id="lead-name" required value={draft.name} onChange={set('name')} className={inputClass} autoComplete="off" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-phone" label="Phone">
                <input id="lead-phone" type="tel" inputMode="tel" value={draft.phone} onChange={set('phone')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-email" label="Email">
                <input id="lead-email" type="email" inputMode="email" value={draft.email} onChange={set('email')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <Field id="lead-address" label="Service address">
              <input id="lead-address" required value={draft.address} onChange={set('address')} className={inputClass} autoComplete="off" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-utility" label="Utility">
                <input id="lead-utility" value={draft.utility} onChange={set('utility')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-tdu" label="TDU">
                <input id="lead-tdu" value={draft.tdu} onChange={set('tdu')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-account" label="Account number">
                <input id="lead-account" value={draft.accountNumber} onChange={set('accountNumber')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-esiid" label="ESI ID">
                <input id="lead-esiid" inputMode="numeric" value={draft.esiid} onChange={set('esiid')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-meter" label="Meter">
                <input id="lead-meter" value={draft.meterNumber} onChange={set('meterNumber')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-puct" label="PUCT certificate">
                <input id="lead-puct" inputMode="numeric" value={draft.repPuctCertificate} onChange={set('repPuctCertificate')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-kwh" label="kWh this period">
                <input id="lead-kwh" inputMode="decimal" value={draft.kwh} onChange={set('kwh')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-days" label="Days in period">
                <input id="lead-days" inputMode="numeric" value={draft.days} onChange={set('days')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-amount" label="Bill amount">
                <input id="lead-amount" inputMode="decimal" value={draft.totalDue} onChange={set('totalDue')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-current" label="Current charges">
                <input id="lead-current" inputMode="decimal" value={draft.currentCharges} onChange={set('currentCharges')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-past" label="Past due">
                <input id="lead-past" inputMode="decimal" value={draft.pastDue} onChange={set('pastDue')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-avg" label="Average monthly kWh">
                <input id="lead-avg" inputMode="decimal" value={draft.avgMonthlyKwh} onChange={set('avgMonthlyKwh')} className={inputClass} autoComplete="off" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="lead-last-year" label="kWh same month last year">
                <input id="lead-last-year" inputMode="decimal" value={draft.kwhSameMonthLastYear} onChange={set('kwhSameMonthLastYear')} className={inputClass} autoComplete="off" />
              </Field>
              <Field id="lead-stage" label="Stage">
                <select id="lead-stage" value={draft.stage} onChange={set('stage')} className={inputClass}>
                  {LEAD_STAGES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field id="lead-notes" label="Notes">
              <textarea id="lead-notes" rows={4} value={draft.notes} onChange={set('notes')} className={inputClass} />
            </Field>
            <Field id="lead-bill" label="Light bill">
              <input id="lead-bill" type="file" accept={ACCEPT} onChange={(event) => void onFile(event)} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-hub-muted file:px-3 file:py-2 file:text-[0.84rem] file:font-semibold file:text-hub-ink`} />
            </Field>
            {reading && <p className="m-0 text-[0.86rem] text-hub-soft">Reading the bill…</p>}
            {billNote && <Notice tone={billNote.startsWith('Numbers filled') ? 'success' : 'warn'}>{billNote}</Notice>}
            {draft.usageHistory && draft.usageHistory.length > 0 && (
              <p className="m-0 text-[0.82rem] text-hub-soft">{draft.usageHistory.length} months of usage history will be saved with this lead.</p>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
          <div className="flex flex-col gap-2 border-t border-hub-line bg-hub-muted px-4 py-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" variant="accent" disabled={busy || reading} className="w-full sm:w-auto">
              {busy ? <Spinner className="h-4 w-4" /> : mode === 'create' ? 'Save lead' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
