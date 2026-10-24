import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Globe,
  LayoutDashboard,
  Link2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
} from 'lucide-react';
import UsageCard, { type CustomerUsage } from '../components/dashboard/UsageCard';
import { callFunction, supabase } from '../lib/supabase';
import type { Profile } from './Dashboard';
import { Button, Notice, Spinner, cn, inputClass, labelClass } from './ui';
import { centralDateKey, centralTimeValue, centralToIso, formatBytes, formatDay, formatTime, todayCentralKey } from './time';

interface BillFile {
  id: string;
  bucket: string;
  storage_path: string;
  original_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
}

interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: 'booked' | 'cancelled';
  source: 'public' | 'dashboard';
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  google_event_id: string | null;
  google_sync_error: string | null;
  hub_appointment_files: BillFile[];
}

interface CalendarEventRow {
  appointment_id: string | null;
  customer_id: string | null;
  user_id: string;
  google_event_id: string | null;
  sync_error: string | null;
}

interface GoogleMember {
  userId: string;
  fullName: string | null;
  role: 'owner' | 'admin';
  requiredForAvailability: boolean;
}

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  error: string | null;
  needsReconnect: boolean;
}

type Item =
  | { kind: 'appt'; start: string; end: string; appt: Appointment }
  | { kind: 'busy'; start: string; end: string };

const GOOGLE_MESSAGES: Record<string, { tone: 'success' | 'error' | 'warn'; text: string }> = {
  connected: { tone: 'success', text: 'Google Calendar connected. New bookings will appear on your phone.' },
  denied: { tone: 'warn', text: 'Google Calendar was not connected (access was declined).' },
  expired: { tone: 'warn', text: 'That connection link expired. Tap “Connect Google Calendar” again.' },
  forbidden: { tone: 'error', text: 'That Google account can’t be connected to this dashboard.' },
  not_ready: { tone: 'warn', text: 'Calendar accounts are not set up yet. Apply the hub calendar migration, then connect again.' },
  no_refresh_token: {
    tone: 'error',
    text: 'Google did not grant offline access. Remove “The Power Genie” at myaccount.google.com/permissions, then connect again.',
  },
  missing_scope: { tone: 'error', text: 'Please allow calendar access on every checkbox when Google asks.' },
  not_configured: { tone: 'warn', text: 'Google Calendar is not configured yet (missing Google OAuth keys).' },
  error: { tone: 'error', text: 'Something went wrong connecting Google Calendar. Please try again.' },
};

export default function ScheduleTab({ profile }: { profile: Profile }) {
  const isOwner = profile.role === 'owner';
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [members, setMembers] = useState<GoogleMember[]>([]);
  const [eventRows, setEventRows] = useState<CalendarEventRow[]>([]);
  const [busy, setBusy] = useState<{ start: string; end: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warn'; text: string } | null>(() => {
    const g = new URLSearchParams(window.location.search).get('google');
    return g ? GOOGLE_MESSAGES[g] ?? null : null;
  });
  const [showCancelled, setShowCancelled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [functionsReady, setFunctionsReady] = useState(true);
  const [usageByAppointment, setUsageByAppointment] = useState<Record<string, CustomerUsage>>({});

  useEffect(() => {
    // Drop ?google=… so a refresh doesn't repeat the banner.
    const url = new URL(window.location.href);
    if (url.searchParams.has('google')) {
      url.searchParams.delete('google');
      window.history.replaceState({}, '', url);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    const [apptRes, statusRes, eventRes] = await Promise.all([
      supabase!
        .from('hub_appointments')
        .select('*, hub_appointment_files(*)')
        .gte('ends_at', since)
        .order('starts_at', { ascending: true })
        .limit(500),
      callFunction<{ google: GoogleStatus; members?: GoogleMember[]; busy: { start: string; end: string }[] }>('schedule', { body: { action: 'status' } }),
      supabase!
        .from('hub_calendar_events')
        .select('appointment_id, customer_id, user_id, google_event_id, sync_error')
        .order('updated_at', { ascending: false })
        .limit(1000),
    ]);
    if (apptRes.error) setError("Couldn't load appointments. Has the database been set up?");
    const loaded = (apptRes.data as Appointment[]) ?? [];
    setAppts(loaded);
    setUsageByAppointment(await loadMeterUsage(loaded.map((row) => row.id)));
    setEventRows(eventRes.error ? [] : ((eventRes.data as CalendarEventRow[]) ?? []));
    if (statusRes.error) {
      setFunctionsReady(statusRes.error.code !== 'not_configured' && statusRes.error.status !== 404);
      setGoogle(null);
      setMembers([]);
      setBusy([]);
    } else {
      setFunctionsReady(true);
      setGoogle(statusRes.data!.google);
      setMembers(statusRes.data!.members ?? []);
      setBusy(statusRes.data!.busy ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => {
    const visible = appts.filter((a) => showCancelled || a.status === 'booked');
    const booked = appts.filter((a) => a.status === 'booked');
    const list: Item[] = visible.map((a) => ({ kind: 'appt', start: a.starts_at, end: a.ends_at, appt: a }));
    for (const b of busy) {
      // Our own appointments are on Google too — skip the busy block that mirrors one.
      const mirrors = booked.some(
        (a) => new Date(a.starts_at).getTime() === new Date(b.start).getTime() && new Date(a.ends_at).getTime() === new Date(b.end).getTime(),
      );
      if (!mirrors) list.push({ kind: 'busy', start: b.start, end: b.end });
    }
    list.sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
    const groups = new Map<string, Item[]>();
    for (const it of list) {
      const k = centralDateKey(it.start);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    return [...groups.entries()];
  }, [appts, busy, showCancelled]);

  const connect = async () => {
    const { data, error } = await callFunction<{ url: string }>('google-oauth', { body: { action: 'start' } });
    if (error || !data?.url) return setNotice({ tone: 'error', text: error?.message || 'Could not start Google sign-in.' });
    window.location.href = data.url;
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google Calendar? New bookings will stop syncing to your phone.')) return;
    const { error } = await callFunction('schedule', { body: { action: 'disconnect' } });
    if (error) return setNotice({ tone: 'error', text: error.message });
    load();
  };

  const cancel = async (a: Appointment) => {
    if (!confirm(`Cancel ${a.customer_name} on ${formatDay(a.starts_at)} at ${formatTime(a.starts_at)}?`)) return;
    const { data, error } = await callFunction<{ warning?: string | null }>('schedule', { body: { action: 'cancel', id: a.id } });
    if (error) return setNotice({ tone: 'error', text: error.message });
    setNotice(data?.warning ? { tone: 'warn', text: data.warning } : { tone: 'success', text: 'Appointment cancelled.' });
    load();
  };

  const resync = async (a: Appointment) => {
    const { error } = await callFunction('schedule', { body: { action: 'resync', id: a.id } });
    setNotice(error ? { tone: 'error', text: error.message } : { tone: 'success', text: 'Updated on every connected Google Calendar.' });
    load();
  };

  const resyncCustomer = async (customerId: string) => {
    const { error } = await callFunction('schedule', { body: { action: 'resync_customer', id: customerId } });
    setNotice(error ? { tone: 'error', text: error.message } : { tone: 'success', text: 'Updated on every connected Google Calendar.' });
    load();
  };

  const memberName = (userId: string) => members.find((member) => member.userId === userId)?.fullName || 'A team member';
  const rowsFor = (appointmentId: string) => eventRows.filter((row) => row.appointment_id === appointmentId);
  const customerFailures = eventRows.filter((row) => row.customer_id && row.sync_error);

  const today = todayCentralKey();

  return (
    <div className="grid gap-4">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <GoogleCard
        google={google}
        members={members}
        functionsReady={functionsReady}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <section aria-label="Upcoming appointments" className="rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold">Upcoming</h2>
            <p className="m-0 text-[0.86rem] text-[#6B7280]">Appointments and your Google busy time · Central time</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E3E8EF] hover:border-[#1A1A2E]" aria-label="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            {isOwner && (
              <Button onClick={() => setAdding((v) => !v)} variant={adding ? 'ghost' : 'primary'}>
                <CalendarPlus className="h-4 w-4" /> {adding ? 'Close' : 'Add appointment'}
              </Button>
            )}
          </div>
        </div>

        {adding && isOwner && (
          <AddAppointment
            onDone={(msg) => {
              setAdding(false);
              setNotice({ tone: 'success', text: msg });
              load();
            }}
          />
        )}

        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

        {customerFailures.length > 0 && (
          <div className="mt-4">
            <Notice tone="warn">
              <span className="grid gap-2">
                {customerFailures.map((row) => (
                  <span key={`${row.customer_id}-${row.user_id}`} className="flex flex-wrap items-center gap-2">
                    <span>{memberName(row.user_id)} didn’t get a website consult on Google Calendar.</span>
                    <Button variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => resyncCustomer(row.customer_id!)}>
                      <RefreshCw className="h-4 w-4" /> Retry
                    </Button>
                  </span>
                ))}
              </span>
            </Notice>
          </div>
        )}

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-[0.86rem] text-[#4A5568]">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 accent-[#FF6B00]" />
          Show cancelled
        </label>

        {loading && !appts.length ? (
          <div className="py-10 text-center text-[#6B7280]"><Spinner /></div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-[#6B7280]">Nothing on the calendar yet. Bookings from the /book page will show up here.</p>
        ) : (
          <div className="mt-2 grid gap-6">
            {items.map(([day, list]) => (
              <div key={day}>
                <h3 className="m-0 mb-2 text-[0.82rem] font-semibold uppercase tracking-wide text-[#6B7280]">
                  {day === today ? 'Today · ' : ''}
                  {formatDay(list[0].start)}
                </h3>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {list.map((it) =>
                    it.kind === 'busy' ? (
                      <li key={`b-${it.start}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-[#D6DCE5] bg-[#FAFBFD] px-4 py-3 text-[0.9rem] text-[#6B7280]">
                        <span className="w-[120px] shrink-0 font-semibold text-[#4A5568]">{formatTime(it.start)} – {formatTime(it.end)}</span>
                        Busy (Google Calendar)
                      </li>
                    ) : (
                      <AppointmentCard
                        key={it.appt.id}
                        usage={usageByAppointment[it.appt.id] ?? null}
                        appt={it.appt}
                        isOwner={isOwner}
                        members={members}
                        events={rowsFor(it.appt.id)}
                        onCancel={cancel}
                        onResync={resync}
                        onRescheduled={(warning) => {
                          setNotice(warning ? { tone: 'warn', text: warning } : { tone: 'success', text: 'Appointment moved on every connected calendar.' });
                          load();
                        }}
                      />
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GoogleCard({
  google,
  members,
  functionsReady,
  onConnect,
  onDisconnect,
}: {
  google: GoogleStatus | null;
  members: GoogleMember[];
  functionsReady: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const extraRequired = members.some((member) => member.role !== 'owner' && member.requiredForAvailability);
  let body: React.ReactNode;
  if (!functionsReady) {
    body = <span>The scheduling server isn't set up yet, so Google Calendar sync is off for now.</span>;
  } else if (!google) {
    body = <span className="inline-flex items-center gap-2"><Spinner className="h-4 w-4" /> Checking Google Calendar…</span>;
  } else if (!google.configured) {
    body = <span>Google Calendar isn't configured yet. Add the Google OAuth secrets on the Supabase project to turn on phone sync.</span>;
  } else if (!google.connected) {
    body = (
      <span>
        Not connected. Connect your calendar and new bookings are added to it. Members who skip this are left off the event. Open times follow Horace’s calendar.{extraRequired ? ' Calendars marked required block open times too.' : ''}
      </span>
    );
  } else {
    body = (
      <span>
        Connected{google.email ? <> as <span className="font-semibold">{google.email}</span></> : ''}. Bookings are added to your calendar and every other connected member’s calendar. Open times follow Horace’s calendar.{extraRequired ? ' Calendars marked required block open times too.' : ''}
        {google.error && (
          <span className="mt-1 block font-semibold text-[#B42318]">
            {google.needsReconnect ? 'Google access expired — please reconnect.' : google.error}
          </span>
        )}
      </span>
    );
  }

  const canConnect = functionsReady && !!google?.configured;
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-label="Google Calendar">
      <div className="flex gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', google?.connected && !google.error ? 'bg-[#EEF9F0] text-[#1E7B34]' : 'bg-[#FFF5EC] text-[#C2410C]')}>
          {google?.connected && !google.error ? <CheckCircle2 className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
        </span>
        <div className="text-[0.92rem] leading-relaxed">
          <p className="m-0 font-bold">Google Calendar</p>
          {body}
        </div>
      </div>
      {canConnect && (
        <div className="flex shrink-0 gap-2">
          {(!google!.connected || google!.needsReconnect) && <Button onClick={onConnect}>Connect Google Calendar</Button>}
          {google!.connected && !google!.needsReconnect && (
            <>
              <Button variant="ghost" onClick={onConnect}>Reconnect</Button>
              <Button variant="quiet" onClick={onDisconnect} className="text-[#B42318]">Disconnect</Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function syncLine(appt: Appointment, members: GoogleMember[], events: CalendarEventRow[]) {
  const failed = events.filter((row) => row.sync_error);
  const synced = events.filter((row) => row.google_event_id);
  if (failed.length) {
    const names = failed.map((row) => members.find((member) => member.userId === row.user_id)?.fullName || 'A team member');
    return { tone: 'bad' as const, text: `Not on ${names.join(' and ')}’s calendar yet` };
  }
  if (synced.length) {
    return { tone: 'ok' as const, text: synced.length === 1 ? 'On Google Calendar' : `On ${synced.length} Google Calendars` };
  }
  if (appt.google_event_id) return { tone: 'ok' as const, text: 'On Google Calendar' };
  if (appt.google_sync_error) return { tone: 'bad' as const, text: 'Not on Google Calendar yet' };
  if (members.length) return { tone: 'muted' as const, text: 'Not synced' };
  return { tone: 'muted' as const, text: 'Google Calendar not connected' };
}

const METER_STATUSES = new Set(['pending_setup', 'requested', 'approved', 'expired', 'failed']);

async function loadMeterUsage(appointmentIds: string[]): Promise<Record<string, CustomerUsage>> {
  if (!supabase || appointmentIds.length === 0) return {};
  const authRes = await supabase
    .from('smt_authorizations')
    .select('id, appointment_id, status, esi_id')
    .in('appointment_id', appointmentIds);
  if (authRes.error || !authRes.data) return {};
  const auths = authRes.data as { id: string; appointment_id: string; status: string; esi_id: string | null }[];
  const authIds = auths.map((row) => row.id);
  const [monthlyRes, intervalRes] = authIds.length
    ? await Promise.all([
      supabase.from('smt_usage_monthly').select('authorization_id, period_start, period_end, kwh').in('authorization_id', authIds),
      supabase.from('smt_usage_intervals').select('authorization_id').in('authorization_id', authIds),
    ])
    : [{ data: [] as { authorization_id: string; period_start: string; period_end: string; kwh: number }[] }, { data: [] as { authorization_id: string }[] }];
  const withIntervals = new Set((intervalRes.data ?? []).map((row) => row.authorization_id));
  const rowsByAuth = new Map<string, CustomerUsage['rows']>();
  for (const row of monthlyRes.data ?? []) {
    const list = rowsByAuth.get(row.authorization_id) ?? [];
    list.push({ periodStart: row.period_start, periodEnd: row.period_end, kwh: Number(row.kwh) });
    rowsByAuth.set(row.authorization_id, list);
  }
  const usage: Record<string, CustomerUsage> = {};
  for (const auth of auths) {
    if (!METER_STATUSES.has(auth.status)) continue;
    usage[auth.appointment_id] = {
      status: auth.status as CustomerUsage['status'],
      esiId: auth.esi_id,
      rows: rowsByAuth.get(auth.id) ?? [],
      hasIntervals: withIntervals.has(auth.id),
    };
  }
  return usage;
}

function AppointmentCard({
  appt: a,
  usage,
  isOwner,
  members,
  events,
  onCancel,
  onResync,
  onRescheduled,
}: {
  appt: Appointment;
  usage: CustomerUsage | null;
  isOwner: boolean;
  members: GoogleMember[];
  events: CalendarEventRow[];
  onCancel: (a: Appointment) => void;
  onResync: (a: Appointment) => void;
  onRescheduled: (warning: string | null) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const cancelled = a.status === 'cancelled';
  const sync = syncLine(a, members, events);
  const needsSync = !cancelled && members.length > 0 && (
    !!a.google_sync_error
    || members.some((member) => !events.some((row) => row.user_id === member.userId && row.google_event_id && !row.sync_error))
  );

  const openBill = async (f: BillFile, download: boolean) => {
    setOpening(f.id + download);
    const name = f.original_name || `light-bill.${f.storage_path.split('.').pop()}`;
    const { data, error } = await supabase!.storage
      .from(f.bucket || 'hub-light-bills')
      .createSignedUrl(f.storage_path, 60, download ? { download: name } : undefined);
    setOpening(null);
    if (error || !data) return alert("Couldn't open the bill. Please try again.");
    if (download) window.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank', 'noopener');
  };

  return (
    <li className={cn('rounded-2xl border px-4 py-3.5', cancelled ? 'border-[#EEF1F5] bg-[#FAFBFD] opacity-70' : 'border-[#E3E8EF] bg-white')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-[0.86rem] font-semibold text-[#C2410C]">
            {formatTime(a.starts_at)} – {formatTime(a.ends_at)}
            {cancelled && <span className="ml-2 rounded-full bg-[#F1F3F7] px-2 py-0.5 text-[0.72rem] text-[#4A5568]">Cancelled</span>}
          </p>
          <p className={cn('m-0 mt-0.5 text-[1.05rem] font-bold', cancelled && 'line-through')}>{a.customer_name}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3F7] px-2.5 py-1 text-[0.74rem] font-semibold text-[#4A5568]">
          {a.source === 'public' ? <><Globe className="h-3.5 w-3.5" /> Booked online</> : <><LayoutDashboard className="h-3.5 w-3.5" /> Added in dashboard</>}
        </span>
      </div>

      <div className="mt-2 grid gap-1 text-[0.9rem] text-[#334155]">
        {a.phone && <a href={`tel:${a.phone}`} className="inline-flex items-center gap-2 no-underline text-inherit"><Phone className="h-4 w-4 text-[#8A94A3]" />{a.phone}</a>}
        {a.email && <a href={`mailto:${a.email}`} className="inline-flex min-w-0 items-center gap-2 break-all no-underline text-inherit"><Mail className="h-4 w-4 shrink-0 text-[#8A94A3]" />{a.email}</a>}
        {a.address && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 no-underline text-inherit">
            <MapPin className="h-4 w-4 shrink-0 text-[#8A94A3]" />{a.address}
          </a>
        )}
        {a.note && <p className="m-0 mt-1 whitespace-pre-wrap rounded-xl bg-[#F6F7FB] px-3 py-2 text-[0.88rem]">{a.note}</p>}
        {usage ? <UsageCard usage={usage} /> : null}
      </div>

      {a.hub_appointment_files?.length > 0 && (
        <div className="mt-3 grid gap-2">
          {a.hub_appointment_files.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#BFE3C6] bg-[#EEF9F0] px-3 py-2">
              <span className="inline-flex min-w-0 items-center gap-2 text-[0.88rem]">
                <FileText className="h-4 w-4 shrink-0 text-[#1E7B34]" />
                <span className="font-semibold">Light bill</span>
                <span className="truncate text-[#4A5568]">{f.original_name} · {formatBytes(f.size_bytes)}</span>
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => openBill(f, false)} disabled={!!opening}>
                  <Eye className="h-4 w-4" /> View
                </Button>
                <Button variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => openBill(f, true)} disabled={!!opening}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      {!cancelled && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EEF1F5] pt-3">
          <span className="text-[0.8rem] text-[#6B7280]">
            {sync.tone === 'ok' ? (
              <span className="inline-flex items-center gap-1 text-[#1E7B34]"><CheckCircle2 className="h-4 w-4" /> {sync.text}</span>
            ) : sync.tone === 'bad' ? (
              <span className="inline-flex items-center gap-1 text-[#B42318]"><AlertTriangle className="h-4 w-4" /> {sync.text}</span>
            ) : (
              sync.text
            )}
            {a.google_sync_error && sync.tone === 'bad' && <span className="mt-1 block">{a.google_sync_error}</span>}
          </span>
          <span className="flex flex-wrap gap-2">
            {needsSync && members.length > 0 && (
              <Button variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => onResync(a)}>
                <RefreshCw className="h-4 w-4" /> Sync now
              </Button>
            )}
            {isOwner && (
              <>
                <Button variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => setMoving((open) => !open)}>
                  {moving ? 'Close' : 'Change time'}
                </Button>
                <Button variant="danger" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => onCancel(a)}>Cancel</Button>
              </>
            )}
          </span>
        </div>
      )}
      {moving && isOwner && (
        <RescheduleForm
          appt={a}
          onDone={(warning) => {
            setMoving(false);
            onRescheduled(warning);
          }}
        />
      )}
    </li>
  );
}

function RescheduleForm({ appt, onDone }: { appt: Appointment; onDone: (warning: string | null) => void }) {
  const [date, setDate] = useState(centralDateKey(appt.starts_at));
  const [time, setTime] = useState(centralTimeValue(appt.starts_at));
  const [duration, setDuration] = useState(() => {
    const minutes = Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60000);
    return [30, 60, 90, 120].includes(minutes) ? minutes : 60;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleConflict, setGoogleConflict] = useState(false);
  const times = useMemo(() => {
    const out: string[] = [];
    for (let h = 7; h <= 21; h++) for (const m of [0, 15, 30, 45]) out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    return out;
  }, []);

  const submit = async (ignoreGoogleBusy = false) => {
    setBusy(true);
    setError(null);
    const { data, error: saveError } = await callFunction<{ warning?: string | null }>('schedule', {
      body: { action: 'reschedule', id: appt.id, start: centralToIso(date, time), durationMinutes: duration, ignoreGoogleBusy },
    });
    setBusy(false);
    if (saveError) {
      setGoogleConflict(saveError.code === 'google_busy');
      setError(saveError.message);
      return;
    }
    onDone(data?.warning ?? null);
  };

  return (
    <form
      className="mt-3 grid gap-3 rounded-2xl border border-[#E3E8EF] bg-[#FAFBFD] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`move-date-${appt.id}`} className={labelClass}>Date</label>
          <input id={`move-date-${appt.id}`} type="date" required value={date} min={todayCentralKey()} onChange={(event) => setDate(event.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`move-time-${appt.id}`} className={labelClass}>Start (Central)</label>
          <select id={`move-time-${appt.id}`} value={time} onChange={(event) => setTime(event.target.value)} className={inputClass}>
            {times.map((value) => {
              const [hour, minute] = value.split(':').map(Number);
              const label = `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
              return <option key={value} value={value}>{label}</option>;
            })}
          </select>
        </div>
        <div>
          <label htmlFor={`move-dur-${appt.id}`} className={labelClass}>Length</label>
          <select id={`move-dur-${appt.id}`} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className={inputClass}>
            {[30, 60, 90, 120].map((value) => <option key={value} value={value}>{value < 60 ? `${value} min` : `${value / 60} hr${value > 60 ? 's' : ''}`}</option>)}
          </select>
        </div>
      </div>
      {error && <Notice tone={googleConflict ? 'warn' : 'error'}>{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save new time'}</Button>
        {googleConflict && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit(true)}>Move anyway</Button>
        )}
      </div>
    </form>
  );
}

function AddAppointment({ onDone }: { onDone: (msg: string) => void }) {
  const [date, setDate] = useState(todayCentralKey());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleConflict, setGoogleConflict] = useState(false);

  const times = useMemo(() => {
    const out: string[] = [];
    for (let h = 7; h <= 21; h++) for (const m of [0, 15, 30, 45]) out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    return out;
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>, ignoreGoogleBusy = false) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { data, error } = await callFunction<{ warning?: string | null }>('schedule', {
      body: {
        action: 'create',
        start: centralToIso(date, time),
        durationMinutes: duration,
        name: fd.get('name'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        address: fd.get('address'),
        note: fd.get('note'),
        ignoreGoogleBusy,
      },
    });
    setBusy(false);
    if (error) {
      setGoogleConflict(error.code === 'google_busy');
      return setError(error.message);
    }
    onDone(data?.warning ? `Appointment saved. ${data.warning}` : 'Appointment added on every connected Google Calendar.');
  };

  const label = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };

  return (
    <form id="add-appt" onSubmit={(e) => submit(e)} className="mt-4 grid gap-4 rounded-2xl border border-[#E3E8EF] bg-[#FAFBFD] p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="a-date" className={labelClass}>Date</label>
          <input id="a-date" type="date" required value={date} min={todayCentralKey()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="a-time" className={labelClass}>Start (Central)</label>
          <select id="a-time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
            {times.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="a-dur" className={labelClass}>Length</label>
          <select id="a-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
            {[30, 60, 90, 120].map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? 's' : ''}`}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="a-name" className={labelClass}>Customer name</label>
          <input id="a-name" name="name" required maxLength={120} className={inputClass} />
        </div>
        <div>
          <label htmlFor="a-phone" className={labelClass}>Phone</label>
          <input id="a-phone" name="phone" type="tel" maxLength={40} className={inputClass} />
        </div>
        <div>
          <label htmlFor="a-email" className={labelClass}>Email</label>
          <input id="a-email" name="email" type="email" maxLength={254} className={inputClass} />
        </div>
        <div>
          <label htmlFor="a-address" className={labelClass}>Address</label>
          <input id="a-address" name="address" maxLength={300} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="a-note" className={labelClass}>Note</label>
        <textarea id="a-note" name="note" rows={2} maxLength={1000} className={inputClass} />
      </div>
      {error && <Notice tone={googleConflict ? 'warn' : 'error'}>{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? <Spinner className="h-4 w-4" /> : 'Save appointment'}</Button>
        {googleConflict && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={(e) => {
              const form = (e.currentTarget as HTMLButtonElement).form!;
              submit({ preventDefault() {}, currentTarget: form } as unknown as React.FormEvent<HTMLFormElement>, true);
            }}
          >
            Add anyway
          </Button>
        )}
      </div>
    </form>
  );
}
