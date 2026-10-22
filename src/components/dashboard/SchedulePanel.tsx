import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiFetch, readMessage, readSlots } from '../../lib/api';
import { validateCustomer } from '../../lib/bookingForm';
import { formatBytes, type DashboardProfile } from '../../lib/dashboard';
import { isBillDownloadUrl } from '../../lib/lightBill';
import { supabaseUrl } from '../../lib/supabaseClient';
import {
  calendarWeekday,
  chicagoDayRange,
  chicagoParts,
  clipBusyRanges,
  daysInMonth,
  formatChicagoDay,
  formatChicagoTime,
  generateOpenSlots,
  groupSlotsByChicagoDay,
  rangesOverlap,
  zonedWallTimeToUtc,
  type BusyRange,
} from '../../lib/slots';
import {
  CustomerFields,
  Notice,
  emptyCustomer,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  type CustomerFormValues,
} from './ui';

type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: 'confirmed' | 'cancelled';
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  note: string | null;
  google_event_id: string | null;
  calendar_sync_error: string | null;
  source: 'public' | 'dashboard';
  light_bill_name: string | null;
  light_bill_size: number | null;
  light_bill_uploaded_at: string | null;
};

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseAppointment(value: unknown): Appointment | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.starts_at !== 'string' || typeof row.ends_at !== 'string') return null;
  if (row.status !== 'confirmed' && row.status !== 'cancelled') return null;
  return {
    id: row.id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    customer_name: typeof row.customer_name === 'string' ? row.customer_name : '',
    customer_phone: typeof row.customer_phone === 'string' ? row.customer_phone : '',
    customer_email: typeof row.customer_email === 'string' ? row.customer_email : '',
    customer_address: typeof row.customer_address === 'string' ? row.customer_address : '',
    note: typeof row.note === 'string' ? row.note : null,
    google_event_id: typeof row.google_event_id === 'string' ? row.google_event_id : null,
    calendar_sync_error: typeof row.calendar_sync_error === 'string' ? row.calendar_sync_error : null,
    source: row.source === 'dashboard' ? 'dashboard' : 'public',
    light_bill_name: typeof row.light_bill_uploaded_at === 'string' && typeof row.light_bill_name === 'string'
      ? row.light_bill_name
      : null,
    light_bill_size: readSize(row.light_bill_size),
    light_bill_uploaded_at: typeof row.light_bill_uploaded_at === 'string' ? row.light_bill_uploaded_at : null,
  };
}

function readSize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function devPreviewAppointments(): Appointment[] {
  const slot = generateOpenSlots({ now: new Date(), busy: [] })[0];
  const start = slot ?? new Date(Date.now() + 2 * 60 * 60 * 1000);
  return [{
    id: '00000000-0000-4000-8000-000000000001',
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
    status: 'confirmed',
    customer_name: 'Jamie Lee',
    customer_phone: '(713) 555-0100',
    customer_email: 'jamie@example.com',
    customer_address: '1200 Smith St, Houston, TX',
    note: 'Gate code is on the call.',
    google_event_id: 'preview-event',
    calendar_sync_error: null,
    source: 'public',
    light_bill_name: 'october-light-bill.pdf',
    light_bill_size: 248320,
    light_bill_uploaded_at: new Date().toISOString(),
  }];
}

function readBusy(json: unknown): BusyRange[] {
  if (!json || typeof json !== 'object') return [];
  const busy = (json as { busy?: unknown }).busy;
  if (!Array.isArray(busy)) return [];
  const ranges: BusyRange[] = [];
  for (const item of busy) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { start?: unknown; end?: unknown };
    if (typeof row.start !== 'string' || typeof row.end !== 'string') continue;
    const start = new Date(row.start);
    const end = new Date(row.end);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) ranges.push({ start, end });
  }
  return ranges;
}

function dayKey(date: Date): string {
  const parts = chicagoParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export default function SchedulePanel({
  client,
  preview = false,
}: {
  client: SupabaseClient | null;
  profile: DashboardProfile;
  preview?: boolean;
}) {
  const today = chicagoParts(new Date());
  const previewRows = import.meta.env.DEV && preview ? devPreviewAppointments() : [];
  const previewStart = previewRows[0] ? chicagoParts(new Date(previewRows[0].starts_at)) : null;
  const [cursor, setCursor] = useState(
    previewStart ? { year: previewStart.year, month: previewStart.month } : { year: today.year, month: today.month },
  );
  const [appointments, setAppointments] = useState<Appointment[]>(previewRows);
  const [googleBusy, setGoogleBusy] = useState<BusyRange[]>([]);
  const [connected, setConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [openSlots, setOpenSlots] = useState<Date[]>(() => (
    preview ? generateOpenSlots({ now: new Date(), busy: [] }) : []
  ));
  const [selectedDay, setSelectedDay] = useState<string | null>(
    previewRows[0] ? dayKey(new Date(previewRows[0].starts_at)) : null,
  );
  const [slot, setSlot] = useState<Date | null>(null);
  const [customer, setCustomer] = useState<CustomerFormValues>(emptyCustomer);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (preview) {
      setOpenSlots(generateOpenSlots({ now: new Date(), busy: [] }));
      setLoading(false);
      return undefined;
    }
    if (!client) return undefined;
    let cancelled = false;
    const monthStart = zonedWallTimeToUtc(cursor.year, cursor.month, 1, 0, 0);
    const next = shiftMonth(cursor.year, cursor.month, 1);
    const monthEnd = zonedWallTimeToUtc(next.year, next.month, 1, 0, 0);

    const load = async () => {
      setLoading(true);
      setError(null);
      const [rows, status, busy, slots] = await Promise.all([
        client
          .from('appointments')
          .select('id, starts_at, ends_at, status, customer_name, customer_phone, customer_email, customer_address, note, google_event_id, calendar_sync_error, source, light_bill_name, light_bill_size, light_bill_uploaded_at')
          .gte('starts_at', monthStart.toISOString())
          .lt('starts_at', monthEnd.toISOString())
          .order('starts_at', { ascending: true }),
        apiFetch(client, '/api/google/status'),
        apiFetch(client, `/api/google/freebusy?timeMin=${encodeURIComponent(monthStart.toISOString())}&timeMax=${encodeURIComponent(monthEnd.toISOString())}`),
        apiFetch(client, '/api/availability'),
      ]);
      if (cancelled) return;
      if (rows.error) setError('Could not load appointments.');
      else setAppointments((rows.data ?? []).map(parseAppointment).filter((row): row is Appointment => Boolean(row)));

      if (status.json && typeof status.json === 'object') {
        const record = status.json as { connected?: unknown; googleEmail?: unknown };
        setConnected(record.connected === true);
        setGoogleEmail(typeof record.googleEmail === 'string' ? record.googleEmail : null);
      }
      if (busy.ok) setGoogleBusy(readBusy(busy.json));
      else setError(readMessage(busy.json, 'Google Calendar could not be checked.'));

      const slotIsos = readSlots(slots.json);
      setOpenSlots(slotIsos ? slotIsos.map((iso) => new Date(iso)).filter((date) => !Number.isNaN(date.getTime())) : []);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [client, cursor.month, cursor.year, preview, refreshKey]);

  const uncovered = useMemo(() => clipBusyRanges(
    googleBusy,
    appointments
      .filter((appointment) => appointment.status === 'confirmed')
      .map((appointment) => ({ start: new Date(appointment.starts_at), end: new Date(appointment.ends_at) })),
  ), [appointments, googleBusy]);

  const groups = groupSlotsByChicagoDay(openSlots);
  const [addDay, setAddDay] = useState<string | null>(null);
  const activeAddDay = addDay && groups.some((group) => group.key === addDay) ? addDay : groups[0]?.key ?? null;
  const activeGroup = groups.find((group) => group.key === activeAddDay) ?? null;
  const selectedSlot = slot && activeGroup?.slots.some((item) => item.getTime() === slot.getTime()) ? slot : null;

  const visibleAppointments = appointments.filter((appointment) => {
    if (!selectedDay) return new Date(appointment.ends_at).getTime() > Date.now();
    return dayKey(new Date(appointment.starts_at)) === selectedDay;
  });
  const visibleBusy = uncovered.filter((range) => {
    if (!selectedDay) return range.end.getTime() > Date.now();
    const [year, month, day] = selectedDay.split('-').map(Number);
    const window = chicagoDayRange(year, month, day);
    return rangesOverlap(range.start, range.end, window.start, window.end);
  });

  async function openBill(appointment: Appointment) {
    if (!appointment.light_bill_name) return;
    if (preview || !client || !supabaseUrl) {
      setNotice('Preview only. Horace opens the bill from this appointment after a customer uploads it.');
      return;
    }
    setError(null);
    const result = await apiFetch(client, `/api/light-bill?appointmentId=${encodeURIComponent(appointment.id)}`);
    const url = result.json && typeof result.json === 'object' ? (result.json as { url?: unknown }).url : null;
    if (!result.ok || typeof url !== 'string' || !isBillDownloadUrl(url, supabaseUrl)) {
      setError(readMessage(result.json, 'The light bill could not be opened.'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function connect() {
    if (preview || !client) {
      setNotice('Preview only. Connect works after the server keys are set.');
      return;
    }
    setNotice(null);
    const result = await apiFetch(client, '/api/google/connect');
    const url = result.json && typeof result.json === 'object' ? (result.json as { url?: unknown }).url : null;
    if (typeof url === 'string') {
      window.location.href = url;
      return;
    }
    setNotice(readMessage(result.json, 'Could not start the Google connection.'));
  }

  async function addAppointment() {
    if (!selectedSlot) {
      setError('Pick an open time.');
      return;
    }
    const customerResult = validateCustomer(customer);
    if (!customerResult.ok) {
      setError(customerResult.message);
      return;
    }
    if (preview || !client) {
      setNotice('Preview only. Saving an appointment needs the server.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await apiFetch(client, '/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ slot: selectedSlot.toISOString(), ...customerResult.value, note: customer.note }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(readMessage(result.json, 'Could not save that appointment.'));
      return;
    }
    const synced = result.json && typeof result.json === 'object' && (result.json as { calendarSynced?: unknown }).calendarSynced === true;
    setNotice(synced ? 'Appointment saved on the schedule and on Google Calendar.' : 'Appointment saved here. It is not on Google Calendar yet.');
    setCustomer(emptyCustomer());
    setSlot(null);
    setRefreshKey((value) => value + 1);
  }

  async function cancel(appointment: Appointment) {
    if (preview || !client) return;
    const when = `${formatChicagoDay(new Date(appointment.starts_at))} at ${formatChicagoTime(new Date(appointment.starts_at))}`;
    if (!window.confirm(`Cancel the call with ${appointment.customer_name} on ${when}? This also removes it from Google Calendar when that sync is on.`)) return;
    setError(null);
    const result = await apiFetch(client, '/api/appointments', {
      method: 'DELETE',
      body: JSON.stringify({ id: appointment.id }),
    });
    if (!result.ok) {
      setError(readMessage(result.json, 'Could not cancel that appointment.'));
      return;
    }
    setNotice('Appointment cancelled.');
    setRefreshKey((value) => value + 1);
  }

  const cells: Array<number | null> = [
    ...Array.from({ length: calendarWeekday(cursor.year, cursor.month, 1) }, () => null),
    ...Array.from({ length: daysInMonth(cursor.year, cursor.month) }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(cursor.year, cursor.month - 1, 1)));

  return (
    <section className="grid gap-4" aria-label="Schedule">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)]">
        <div>
          <h2 className="m-0 text-xl font-bold tracking-tight">Schedule</h2>
          <p className="m-0 mt-1 text-sm text-[#4A5568]">
            {connected
              ? `Connected${googleEmail ? ` as ${googleEmail}` : ''}. Phone events show up as busy time.`
              : 'Not connected. Events Horace adds on his phone will not block bookings until Google Calendar is connected.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>
          <button type="button" className={primaryButtonClass} onClick={() => void connect()}>Connect Google Calendar</button>
        </div>
      </div>
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <p className="m-0 text-[#4A5568]">Loading the schedule…</p> : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, -1))} aria-label="Previous month">←</button>
            <p className="m-0 font-bold">{monthLabel}</p>
            <button type="button" className={secondaryButtonClass} onClick={() => setCursor(shiftMonth(cursor.year, cursor.month, 1))} aria-label="Next month">→</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#4A5568]">
            {weekdayLabels.map((label) => <div key={label} className="py-1">{label}</div>)}
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} />;
              const key = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayAppointments = appointments.filter((appointment) => appointment.status === 'confirmed' && dayKey(new Date(appointment.starts_at)) === key);
              const window = chicagoDayRange(cursor.year, cursor.month, day);
              const hasBusy = uncovered.some((range) => rangesOverlap(range.start, range.end, window.start, window.end));
              const selected = selectedDay === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(selected ? null : key)}
                  className={`min-h-11 rounded-lg text-sm font-semibold ${selected ? 'bg-[#0B2233] text-white' : 'bg-[#F4F7FB] text-[#1A1A2E]'} ${focusClass}`}
                >
                  {day}
                  <span className="mt-1 flex justify-center gap-1">
                    {dayAppointments.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B00]" /> : null}
                    {hasBusy ? <span className="h-1.5 w-1.5 rounded-full bg-[#0066CC]" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mb-0 mt-3 text-xs text-[#4A5568]">Orange is a booked call. Blue is busy on Horace's calendar.</p>
        </div>

        <div className="rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)]">
          <h3 className="m-0 text-lg font-bold">{selectedDay ? 'That day' : 'Upcoming'}</h3>
          {visibleAppointments.length === 0 && visibleBusy.length === 0 ? (
            <p className="mb-0 mt-3 text-[#4A5568]">No upcoming calls. New bookings from the public page show up here.</p>
          ) : (
            <ul className="mt-3 grid gap-3 p-0">
              {visibleAppointments.map((appointment) => (
                <li key={appointment.id} id={`appointment-${appointment.id}`} className="rounded-2xl border border-[#E6EAF2] p-3">
                  <p className="m-0 font-bold">
                    {formatChicagoDay(new Date(appointment.starts_at))} · {formatChicagoTime(new Date(appointment.starts_at))}
                    {appointment.status === 'cancelled' ? ' · Cancelled' : ''}
                  </p>
                  <p className="m-0 mt-1">{appointment.customer_name}</p>
                  <p className="m-0 text-sm text-[#4A5568]">{appointment.customer_phone} · {appointment.customer_email}</p>
                  <p className="m-0 text-sm text-[#4A5568]">{appointment.customer_address}</p>
                  {appointment.note ? <p className="m-0 mt-1 text-sm">{appointment.note}</p> : null}
                  {appointment.light_bill_name ? (
                    <div className="mt-2 rounded-xl bg-[#F4F7FB] px-3 py-2">
                      <p className="m-0 text-sm font-semibold">Last month's light bill</p>
                      <p className="m-0 text-sm text-[#4A5568]">
                        {appointment.light_bill_name}
                        {appointment.light_bill_size != null ? ` · ${formatBytes(appointment.light_bill_size)}` : ''}
                      </p>
                      <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={() => void openBill(appointment)}>
                        View light bill
                      </button>
                    </div>
                  ) : null}
                  {appointment.status === 'confirmed' && !appointment.google_event_id ? (
                    <p className="m-0 mt-1 text-sm text-[#8A4B08]">{appointment.calendar_sync_error || 'Not on Google Calendar yet.'}</p>
                  ) : null}
                  {appointment.status === 'confirmed' ? (
                    <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => void cancel(appointment)}>
                      Cancel
                    </button>
                  ) : null}
                </li>
              ))}
              {visibleBusy.map((range) => (
                <li key={`${range.start.toISOString()}-${range.end.toISOString()}`} className="rounded-2xl bg-[#E8F1FB] p-3">
                  <p className="m-0 font-bold">Busy on Horace's calendar</p>
                  <p className="m-0 text-sm text-[#4A5568]">
                    {formatChicagoDay(range.start)} · {formatChicagoTime(range.start)} – {formatChicagoTime(range.end)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <form
        className="grid gap-4 rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)] sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void addAppointment();
        }}
      >
        <div>
          <h3 className="m-0 text-lg font-bold">Add a call</h3>
          <p className="m-0 mt-1 text-sm text-[#4A5568]">Same one-hour weekday slots the public page uses. Booked times and Google busy time are hidden.</p>
        </div>
        {groups.length === 0 ? (
          <p className="m-0 text-[#4A5568]">No open hours in the next 30 days.</p>
        ) : (
          <>
            <label className="grid gap-1 text-sm font-semibold" htmlFor="add-day">
              Day
              <select
                id="add-day"
                className={fieldClass}
                value={activeAddDay ?? ''}
                onChange={(event) => setAddDay(event.target.value)}
              >
                {groups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2" role="listbox" aria-label="Open times">
              {activeGroup?.slots.map((item) => {
                const active = selectedSlot?.getTime() === item.getTime();
                return (
                  <button
                    key={item.toISOString()}
                    type="button"
                    aria-pressed={active}
                    className={`min-h-11 rounded-full px-4 font-semibold ${active ? 'bg-[#FF6B00] text-white' : 'bg-[#F4F7FB] text-[#1A1A2E]'} ${focusClass}`}
                    onClick={() => setSlot(item)}
                  >
                    {formatChicagoTime(item)}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <CustomerFields idPrefix="dash" values={customer} onChange={setCustomer} yourDetails={false} />
        <button type="submit" className={primaryButtonClass} disabled={saving}>
          {saving ? 'Saving…' : 'Save appointment'}
        </button>
      </form>
    </section>
  );
}

const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00]';
