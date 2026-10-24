import React, { useEffect, useRef, useState } from 'react';
import { Eye, FileText, Mail, MapPin, Phone, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Lead, LeadFeed } from './useLeadFeed';
import { Button, Notice, Spinner, cn } from './ui';
import { formatDateTime } from './time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatKwh(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value).toLocaleString('en-US')} kWh`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDateTime(iso)} CT`;
}

function monthLabel(month: string, withYear: boolean): string {
  const [year, raw] = month.split('-');
  const name = MONTHS[Number(raw) - 1] || month;
  return withYear ? `${name} ${year.slice(2)}` : name;
}

function UsageHistory({ points }: { points: Lead['usageHistory'] }) {
  if (!points?.length) return <p className="m-0 text-[0.86rem] text-[#6B7280]">No usage history on the bill.</p>;
  const max = Math.max(...points.map((point) => point.kwh), 1);
  const years = new Set(points.map((point) => point.month.slice(0, 4)));
  const withYear = years.size > 1;
  const summary = points.map((point) => `${point.month} ${Math.round(point.kwh).toLocaleString('en-US')} kWh`).join(', ');
  return (
    <div>
      <div className="overflow-x-auto" role="img" aria-label={`Monthly usage: ${summary}`}>
        <div className="flex h-24 items-end gap-1" style={{ minWidth: Math.max(points.length * 32, 160) }}>
          {points.map((point) => (
            <div key={point.month} className="flex min-w-7 flex-1 flex-col items-center justify-end gap-1" title={`${point.month}: ${point.kwh} kWh`}>
              <span className="text-[0.62rem] font-semibold text-[#4A5568]">{Math.round(point.kwh)}</span>
              <div
                className="w-full rounded-t bg-[#FF6B00]"
                style={{ height: `${Math.max(6, (point.kwh / max) * 52)}px` }}
              />
              <span className="text-[0.62rem] text-[#6B7280]">{monthLabel(point.month, withYear)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#6B7280]">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-[0.95rem]">{children}</dd>
    </div>
  );
}

export default function LeadsTab({ feed }: { feed: LeadFeed }) {
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get('id'));
  const [opening, setOpening] = useState<string | null>(null);
  const [billError, setBillError] = useState<string | null>(null);
  const marked = useRef(new Set<string>());
  const scrolled = useRef<string | null>(null);

  useEffect(() => {
    if (!openId) return;
    const matches = feed.leads.filter((lead) => lead.id === openId);
    for (const lead of matches) {
      const key = `${lead.source}:${lead.id}`;
      if (marked.current.has(key)) continue;
      marked.current.add(key);
      void feed.markSeen(lead);
    }
    if (matches.length && scrolled.current !== openId) {
      scrolled.current = openId;
      document.querySelector(`[data-lead-id="${CSS.escape(openId)}"]`)?.scrollIntoView({ block: 'center' });
    }
  }, [openId, feed.leads, feed.markSeen]);

  const select = (lead: Lead) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'leads');
    url.searchParams.set('id', lead.id);
    window.history.replaceState({}, '', url);
    setOpenId(lead.id);
    marked.current.add(`${lead.source}:${lead.id}`);
    void feed.markSeen(lead);
  };

  const openBill = async (lead: Lead) => {
    if (!lead.bill || !supabase) return;
    setOpening(`${lead.source}:${lead.id}`);
    setBillError(null);
    const { data, error } = await supabase.storage.from(lead.bill.bucket).createSignedUrl(lead.bill.path, 60);
    setOpening(null);
    if (error || !data?.signedUrl) {
      setBillError("Couldn't open that bill. Please try again.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
    void select(lead);
  };

  const missing = !feed.loading && !!openId && feed.leads.every((lead) => lead.id !== openId);

  return (
    <section aria-label="Leads" className="rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold">Leads</h2>
          <p className="m-0 text-[0.86rem] text-[#6B7280]">Website assistant and booking page, newest first</p>
        </div>
        <button
          onClick={feed.refresh}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E3E8EF] hover:border-[#1A1A2E]"
          aria-label="Refresh leads"
        >
          <RefreshCw className={cn('h-4 w-4', feed.loading && 'animate-spin')} />
        </button>
      </div>

      {feed.error && <div className="mt-4"><Notice tone="error">{feed.error}</Notice></div>}
      {billError && <div className="mt-4"><Notice tone="error">{billError}</Notice></div>}
      {missing && (
        <div className="mt-4">
          <Notice tone="warn">That lead isn't in the latest list. It may have been removed, or the link is off.</Notice>
        </div>
      )}

      {feed.loading && !feed.leads.length ? (
        <div className="py-10 text-center text-[#6B7280]"><Spinner /></div>
      ) : feed.leads.length === 0 && !feed.error ? (
        <p className="py-10 text-center text-[#6B7280]">No leads yet. A website consult or a /book appointment will show up here.</p>
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-3 p-0">
          {feed.leads.map((lead) => {
            const selected = openId === lead.id;
            return (
              <li
                key={`${lead.source}:${lead.id}`}
                id={`lead-${lead.source}-${lead.id}`}
                data-lead-id={lead.id}
                className={cn(
                  'scroll-mt-24 rounded-2xl border px-4 py-3.5',
                  lead.cancelled ? 'border-[#EEF1F5] bg-[#FAFBFD] opacity-70' : 'border-[#E3E8EF] bg-white',
                  selected && 'ring-2 ring-[#FF6B00]',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" onClick={() => select(lead)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      {lead.unseen && (
                        <span className="rounded-full bg-[#FF6B00] px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-white">New</span>
                      )}
                      <span className="rounded-full bg-[#FFF5EC] px-2 py-0.5 text-[0.72rem] font-semibold text-[#C2410C]">{lead.sourceLabel}</span>
                      {lead.cancelled && <span className="rounded-full bg-[#F1F3F7] px-2 py-0.5 text-[0.72rem] font-semibold text-[#4A5568]">Cancelled</span>}
                    </span>
                    <span className={cn('mt-1 block text-[1.05rem] font-bold', lead.cancelled && 'line-through')}>{lead.name}</span>
                  </button>
                  <span className="text-[0.78rem] text-[#6B7280]">{formatWhen(lead.createdAt)}</span>
                </div>

                <div className="mt-2 grid gap-1 text-[0.9rem] text-[#334155]">
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 text-inherit no-underline">
                      <Phone className="h-4 w-4 text-[#8A94A3]" />{lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="inline-flex min-w-0 items-center gap-2 break-all text-inherit no-underline">
                      <Mail className="h-4 w-4 shrink-0 text-[#8A94A3]" />{lead.email}
                    </a>
                  )}
                  {lead.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-inherit no-underline"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-[#8A94A3]" />{lead.address}
                    </a>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Fact label="kWh">{formatKwh(lead.kwh)}</Fact>
                  <Fact label="Bill amount">{formatMoney(lead.amount)}</Fact>
                  <Fact label="Appointment">{formatWhen(lead.appointment)}</Fact>
                  <Fact label="ESI ID">{lead.esiid || '—'}</Fact>
                  <Fact label="Meter">{lead.meterNumber || '—'}</Fact>
                  <Fact label="Average monthly">{lead.avgMonthlyKwh == null ? '—' : formatKwh(lead.avgMonthlyKwh)}</Fact>
                </dl>
                {(lead.tdu || lead.repPuctCertificate) && (
                  <p className="m-0 mt-2 text-[0.82rem] text-[#4A5568]">
                    {lead.tdu ? <>TDU {lead.tdu}</> : null}
                    {lead.tdu && lead.repPuctCertificate ? ' · ' : null}
                    {lead.repPuctCertificate ? <>PUCT {lead.repPuctCertificate}</> : null}
                  </p>
                )}

                <div className="mt-3">
                  <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[#6B7280]">Usage history</p>
                  <UsageHistory points={lead.usageHistory} />
                </div>

                <div className="mt-3 border-t border-[#EEF1F5] pt-3">
                  {lead.bill ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#BFE3C6] bg-[#EEF9F0] px-3 py-2">
                      <span className="inline-flex min-w-0 items-center gap-2 text-[0.88rem]">
                        <FileText className="h-4 w-4 shrink-0 text-[#1E7B34]" />
                        <span className="truncate">{lead.bill.name || 'Light bill'}</span>
                      </span>
                      <Button
                        variant="ghost"
                        className="min-h-[36px] px-3 text-[0.84rem]"
                        onClick={() => void openBill(lead)}
                        disabled={opening === `${lead.source}:${lead.id}`}
                      >
                        <Eye className="h-4 w-4" /> {opening === `${lead.source}:${lead.id}` ? 'Opening…' : 'View bill'}
                      </Button>
                    </div>
                  ) : (
                    <p className="m-0 text-[0.86rem] text-[#6B7280]">No bill attached.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
