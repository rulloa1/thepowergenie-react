import { useMemo, useState } from 'react';
import { billingMonths, previousBillingMonth } from '../../supabase/functions/_shared/billing-months';
import type { Lead } from './useLeadFeed';
import { ownerEmailLabel } from './ownerEmailLabel';
import { formatDateTime } from './time';
import { referralFromNote } from './bookingReferral';
import ReferralCredit from './ReferralCredit';
import { Button } from './ui';

export function intakeGaps(lead: Lead, now = new Date()) {
  const known = new Set((lead.usageHistory || []).filter(p => Number.isFinite(p.kwh) && p.kwh >= 0).map(p => p.month));
  const count = Math.max(...[previousBillingMonth(now), now.toISOString().slice(0, 7)].map(end =>
    billingMonths(end).filter(month => known.has(month)).length));
  const missing: string[] = [];
  if (!lead.name.trim() || lead.name === 'Unnamed lead') missing.push('name');
  if ((lead.phone || '').replace(/\D/g, '').length < 10) missing.push('phone');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email || '')) missing.push('email');
  if (!lead.address?.trim()) missing.push('service address');
  if (!lead.bill) missing.push('utility bill');
  if (count < 12) missing.push('electric usage (' + count + '/12 months)');
  return missing;
}

export default function IntakeDesk({ leads, openLead }: { leads: Lead[]; openLead: (id: string) => void }) {
  const [filter, setFilter] = useState('missing');
  const [rep, setRep] = useState('');
  const [state, setState] = useState('');
  const [territory, setTerritory] = useState('');
  const [source, setSource] = useState('');
  const [copied, setCopied] = useState(false);
  const [limit, setLimit] = useState(5);
  const rows = useMemo(() => leads.filter(l => !l.cancelled && !l.archived).map(lead => {
    const fallback = referralFromNote(lead.source === 'booking' ? lead.notes : null);
    return { lead, missing: intakeGaps(lead), rep: lead.referralRep || fallback.rep || lead.sourceLabel,
      state: lead.referralState || fallback.state };
  }), [leads]);
  const sources = [...new Set(rows.map(row => row.rep))].sort();
  const group = rows.filter(row => (!source || source === row.rep) && (!territory || territory === row.state));
  const list = group.filter(({missing}) => filter === 'missing' ? missing.length > 0 : !missing.length);
  const link = new URL('/book', window.location.origin);
  if (rep.trim()) link.searchParams.set('ref', rep.trim());
  if (state.length === 2) link.searchParams.set('state', state);
  return <section className="today-agenda" aria-label="Intake desk">
    <div className="today-title"><h3>Referral intake</h3><a className="text-hub-link underline" href="/book" target="_blank" rel="noreferrer">Open website schedule</a></div>
    <div className="my-3 flex flex-wrap items-end gap-2">
      {['missing','ready'].map(value => <Button key={value} variant={value === filter ? 'accent' : 'ghost'} aria-pressed={filter === value} onClick={() => {setFilter(value);setLimit(5);}}>
        {value === 'missing' ? 'Needs follow-up' : 'Complete intake'} ({group.filter(row => value === 'missing' ? row.missing.length > 0 : !row.missing.length).length})
      </Button>)}
      <label className="today-picker">Referral source<select value={source} onChange={e => {setSource(e.target.value);setLimit(5);}}>
        <option value="">All sources</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="today-picker">Referral state<select value={territory} onChange={e => {setTerritory(e.target.value);setLimit(5);}}>
        <option value="">All states</option>{Array.from(new Set(rows.map(r => r.state).filter((s): s is string => !!s))).sort().map(s => <option key={s}>{s}</option>)}</select></label>
    </div>
    {!list.length && <p>No matching records.</p>}
    {list.slice(0,limit).map(({ lead, missing, rep, state }) => <div className="intake-row" key={lead.source + lead.id}>
      <div><button type="button" className="font-bold text-hub-link underline" onClick={() => openLead(lead.id)}>{lead.name}</button>
      <small className="block">{[rep, state].filter(Boolean).join(' · ')}</small>
      <p>{missing.length ? 'Still needed: ' + missing.join(', ') : 'Contact details, bill and 12 months of usage on file.'}</p>
      <small>{lead.appointment ? 'Scheduled · ' + (lead.appointment.length === 10 ? lead.appointment : formatDateTime(lead.appointment) + ' CT') : 'No appointment on record'}</small>
      {lead.source === 'booking' && <small className="block">Owner email · {ownerEmailLabel(lead.ownerEmailStatus)}</small>}</div>
      <div className="flex flex-wrap gap-3">{lead.phone && <a href={'tel:' + lead.phone}>Call</a>}{lead.email && <a href={'mailto:' + lead.email}>Email</a>}</div>
      {lead.source === 'booking' && lead.referralRep && lead.address && <ReferralCredit id={lead.id} rep={lead.referralRep} />}
    </div>)}
    {list.length > limit && <Button variant="ghost" onClick={() => setLimit(limit + 10)}>Show more</Button>}
    <details className="mt-4"><summary className="cursor-pointer font-bold">Create a rep booking link</summary>
      <div className="today-brief"><label className="today-picker">Rep name or code<input maxLength={64} value={rep} onChange={e => {setRep(e.target.value.replace(/[^a-zA-Z0-9 _.-]/g,''));setCopied(false);}} /></label>
      <label className="today-picker">State code<input maxLength={2} placeholder="TX" value={state} onChange={e => {setState(e.target.value.toUpperCase().replace(/[^A-Z]/g,''));setCopied(false);}} /></label></div>
      <input className="w-full rounded bg-hub-muted p-2" aria-label="Referral booking link" readOnly value={link.href} onFocus={e => e.target.select()} />
      <Button variant="ghost" disabled={!rep.trim() || state.length === 1} onClick={async () => {try {await navigator.clipboard.writeText(link.href);setCopied(true);} catch {window.prompt('Copy your booking link',link.href);}}}>{copied ? 'Copied' : 'Copy booking link'}</Button>
    </details>
  </section>;
}
