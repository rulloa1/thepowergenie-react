import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarDays, Clock, FileUp, Phone, X } from 'lucide-react';
import { MeterFields, emptyMeter, meterBodyFrom, type MeterFormValues } from '../components/dashboard/MeterFields';
import { readMeterRequest } from '../lib/esiId';
import { callFunction, supabase } from '../lib/supabase';
import { usageStatusCopy } from '../lib/usage';
import { BrandMark, Button, Notice, NotConfigured, Spinner, cn, inputClass, labelClass } from './ui';
import { SlotPicker, type SlotPickerHandle } from './SlotPicker';
import { formatBytes, formatDay, formatShortDay, formatTime } from './time';

interface Slot {
  start: string;
  end: string;
}

const MAX_BILL = 10 * 1024 * 1024;
const BILL_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';
const BILL_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const BILL_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

type LoadState = 'loading' | 'ready' | 'not_configured' | 'unavailable' | 'error';

export default function BookingPage() {
  const [state, setState] = useState<LoadState>(supabase ? 'loading' : 'not_configured');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [bill, setBill] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Slot | null>(null);
  const [meter, setMeter] = useState<MeterFormValues>(emptyMeter);
  const [meterStatus, setMeterStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pickerRef = useRef<SlotPickerHandle>(null);

  useEffect(() => {
    document.title = 'Book a Free Solar Consultation — The Power Genie';
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    setState('loading');
    const { data, error } = await callFunction<{ slots: Slot[] }>('booking', { method: 'GET' });
    if (error) {
      setState(error.code === 'not_configured' ? 'not_configured' : error.code === 'calendar_unavailable' ? 'unavailable' : 'error');
      return;
    }
    const list = data?.slots ?? [];
    setSlots(list);
    setState('ready');
    setSlot((current) => (current && list.some((s) => s.start === current.start) ? current : null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = (file: File | null) => {
    setFileError(null);
    if (!file) return setBill(null);
    if (!BILL_EXT.test(file.name) && !BILL_TYPES.has(file.type.toLowerCase())) {
      setBill(null);
      return setFileError('Please choose a PDF, JPG, PNG, WEBP, or HEIC file.');
    }
    if (file.size > MAX_BILL) {
      setBill(null);
      return setFileError('That file is over 10 MB. Try a photo or a smaller PDF.');
    }
    setBill(file);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    if (!slot) {
      if (slots.length > 0) {
        setFormError('Please pick a date and time to complete your booking.');
        document.getElementById('pick-time')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pickerRef.current?.focus();
        return;
      }
    }

    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const meterCheck = readMeterRequest(meterBodyFrom(meter), String(fd.get('email') || ''));
    if (!meterCheck.ok) {
      setFormError(meterCheck.message);
      document.getElementById('connect-meter')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const bookingSlot = slot || {
      start: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      end: new Date(Date.now() + 25 * 3600 * 1000).toISOString(),
    };
    fd.set('start', bookingSlot.start);
    fd.delete('bill');
    if (bill) fd.set('bill', bill, bill.name);
    if (meterCheck.value) {
      fd.set('meterEsiId', meterCheck.value.esiId);
      fd.set('meterNumber', meterCheck.value.meterNumber);
      fd.set('meterEmail', meterCheck.value.email);
      fd.set('meterConsent', 'yes');
    }
    setSubmitting(true);
    const { data, error } = await callFunction<{ ok: boolean; meterStatus?: string | null }>('booking', { body: fd });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      if (error.status === 409) {
        setSlot(null);
        load();
      }
      return;
    }
    setMeterStatus(data?.meterStatus ?? null);
    setBooked(bookingSlot);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (state === 'not_configured') return <NotConfigured what="Online booking" />;

  return (    <div className="book-page min-h-screen bg-gradient-to-b from-[#F8FAFC] via-[#F8FAFC] to-[#F1F5F9] text-[#1A1A2E]">
      <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-white/90 shadow-[0_1px_8px_rgba(0,0,0,0.02)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <a href="/" aria-label="The Power Genie home" className="transition hover:opacity-90">
            <BrandMark />
          </a>
          <a
            href="tel:+15102417007"
            className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-1.5 text-[0.88rem] font-bold text-[#1A1A2E] shadow-sm transition-all hover:border-[#FF6B00] hover:bg-white no-underline"
          >
            <Phone className="h-4 w-4 text-[#FF6B00]" />
            <span className="hidden sm:inline">510-241-7007</span>
            <span className="sm:hidden">Call</span>
          </a>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {booked ? (
          <Confirmation slot={booked} hadBill={!!bill} meterStatus={meterStatus} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFE0CC] bg-[#FFF5EC] px-3 py-1 text-[0.72rem] font-bold uppercase tracking-wider text-[#FF6B00]">
                <CalendarCheck className="h-3.5 w-3.5" /> Free Solar Consultation
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-[0.72rem] font-bold text-[#64748B]">
                Houston & Texas Service Territory
              </span>
            </div>

            <h1 className="m-0 mt-3 text-[clamp(1.85rem,4vw,2.75rem)] font-extrabold leading-tight tracking-tight text-[#1A1A2E]">
              Pick a time that works for you.
            </h1>
            <p className="mt-3 max-w-[62ch] text-[1.02rem] leading-relaxed text-[#4A5568]">
              One hour with Horace Lawrence, your Sunrun solar advisor. He'll walk through your bill, your roof layout,
              and design your custom 14.76 kW + Tesla Powerwall 3 microgrid proposal. All times Central.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.78rem] font-semibold text-[#64748B]">
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-[#E2E8F0] px-2.5 py-1">
                🔒 100% Free & No Obligation
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-[#E2E8F0] px-2.5 py-1">
                ⏱️ 1-on-1 Screen Share or Call
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-white border border-[#E2E8F0] px-2.5 py-1">
                📐 Exact CAD Blueprint Review
              </span>
            </div>

            <div className="mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              {/* Step 1: time */}
              <section aria-labelledby="pick-time" className="min-w-0 rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-[0_8px_30px_rgba(10,20,40,0.04)] sm:p-7">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
                  <h2 id="pick-time" className="m-0 flex items-center gap-2 text-lg font-bold text-[#1A1A2E]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF5EC] text-[#FF6B00]">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    1. Choose a day & time
                  </h2>
                  <span className="text-[0.76rem] font-bold uppercase tracking-wider text-[#64748B]">Step 1 of 2</span>
                </div>

                {state === 'loading' && (
                  <div className="flex items-center gap-3 py-12 text-[#4A5568]">
                    <Spinner /> Finding open appointment windows…
                  </div>
                )}
                {state === 'unavailable' && (
                  <div className="mt-4">
                    <Notice tone="warn" title="Online booking is paused for a moment">
                      We couldn't confirm Horace's calendar right now. Please try again shortly, or call{' '}
                      <a href="tel:+15102417007" className="font-semibold underline">510-241-7007</a>.
                    </Notice>
                    <Button variant="ghost" className="mt-3" onClick={load}>Try again</Button>
                  </div>
                )}
                {state === 'error' && (
                  <div className="mt-4">
                    <Notice tone="error" title="Couldn't load times">Check your connection and try again.</Notice>
                    <Button variant="ghost" className="mt-3" onClick={load}>Try again</Button>
                  </div>
                )}
                {state === 'ready' && slots.length === 0 && (
                  <div className="mt-4">
                    <Notice title="No open times in the next 30 days">
                      Call <a href="tel:+15102417007" className="font-semibold underline">510-241-7007</a> and we'll arrange a dedicated slot.
                    </Notice>
                  </div>
                )}

                {state === 'ready' && slots.length > 0 && (
                  <SlotPicker
                    ref={pickerRef}
                    slots={slots}
                    value={slot}
                    onChange={(next) => {
                      setSlot(next);
                      setFormError(null);
                      if (window.innerWidth < 1024) {
                        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }
                    }}
                  />
                )}
              </section>

              {/* Step 2: details */}
              <section aria-labelledby="your-details" className="min-w-0 rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-[0_8px_30px_rgba(10,20,40,0.04)] sm:p-7">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
                  <h2 id="your-details" className="m-0 flex items-center gap-2 text-lg font-bold text-[#1A1A2E]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFF5EC] text-[#FF6B00]">
                      <Clock className="h-4 w-4" />
                    </span>
                    2. Homeowner details
                  </h2>
                  <span className="text-[0.76rem] font-bold uppercase tracking-wider text-[#64748B]">Step 2 of 2</span>
                </div>

                <form ref={formRef} onSubmit={submit} className="relative mt-4 grid min-w-0 gap-4 scroll-mt-6" noValidate={false}>
                  <div
                    className={cn(
                      'flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-[0.92rem] transition-all',
                      slot
                        ? 'border-[#FFD0AD] bg-[#FFF8F3] text-[#9A3412] shadow-sm'
                        : 'border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[#64748B]',
                    )}
                    aria-live="polite"
                  >
                    <CalendarCheck className={cn('h-5 w-5 shrink-0', slot ? 'text-[#FF6B00]' : 'text-[#94A3B8]')} />
                    <div className="min-w-0 flex-1">
                      {slot ? (
                        <>
                          <span className="font-bold text-[#1A1A2E]">{formatDay(slot.start)}</span>
                          <span className="text-[#64748B]"> · {formatTime(slot.start)} – {formatTime(slot.end)} (Central Time)</span>
                        </>
                      ) : (
                        <span className="text-[0.88rem]">Pick a date and time in Step 1.</span>
                      )}
                    </div>
                    {slot && (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-1 py-1 text-[0.84rem] font-bold text-[#C2410C] underline decoration-[#FF6B00] underline-offset-2 hover:text-[#9A3412] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                        onClick={() => pickerRef.current?.open()}
                      >
                        Change
                      </button>
                    )}
                  </div>

                  {/* Honeypot — hidden from people, tempting to bots. */}
                  <div aria-hidden="true" className="sr-only">
                    <label>
                      Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>

                  <div>
                    <label htmlFor="b-name" className={labelClass}>Full name</label>
                    <input id="b-name" name="name" required maxLength={120} autoComplete="name" placeholder="First and last name" className={inputClass} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="b-phone" className={labelClass}>Phone number</label>
                      <input id="b-phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" placeholder="(832) 555-0199" className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="b-email" className={labelClass}>Email address</label>
                      <input id="b-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@domain.com" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="b-address" className={labelClass}>Service / property address</label>
                    <input id="b-address" name="address" required maxLength={300} autoComplete="street-address" placeholder="Street address, city, TX, ZIP" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="b-note" className={labelClass}>
                      Anything we should know? <span className="font-normal text-[#64748B]">(optional notes, high bills, solar goals)</span>
                    </label>
                    <textarea id="b-note" name="note" rows={3} maxLength={1000} placeholder="e.g. Disconnect notice issued, high summer AC bill, interested in Powerwall 3..." className={cn(inputClass, 'resize-y')} />
                  </div>

                  <div>
                    <span className={labelClass} id="bill-label">Upload electric bill statement (optional)</span>
                    {bill ? (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#86EFAC] bg-[#F0FDF4] px-4 py-3 shadow-sm">
                        <span className="flex min-w-0 items-center gap-2.5 text-[0.92rem]">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#DCFCE7] text-[#166534]">
                            ✓
                          </span>
                          <span className="truncate">
                            <span className="font-bold text-[#14532D]">{bill.name}</span>{' '}
                            <span className="text-[0.8rem] text-[#166534]">({formatBytes(bill.size)})</span>
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => pickFile(null)}
                          className="shrink-0 rounded-lg p-1.5 text-[#166534] transition hover:bg-[#DCFCE7]"
                          aria-label="Remove bill"
                          title="Remove uploaded bill"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#FAFBFD] px-4 py-5 text-center transition-all hover:border-[#FF6B00] hover:bg-[#FFFBF7]">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF5EC] text-[#FF6B00]">
                          <FileUp className="h-5 w-5" />
                        </span>
                        <span className="text-[0.95rem] font-bold text-[#1A1A2E]">Click to upload or take a photo of your electric bill</span>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[0.74rem] text-[#64748B]">
                          <span className="rounded bg-white px-1.5 py-0.5 border border-[#E2E8F0]">PDF</span>
                          <span className="rounded bg-white px-1.5 py-0.5 border border-[#E2E8F0]">JPG</span>
                          <span className="rounded bg-white px-1.5 py-0.5 border border-[#E2E8F0]">PNG</span>
                          <span className="rounded bg-white px-1.5 py-0.5 border border-[#E2E8F0]">WEBP</span>
                          <span className="rounded bg-white px-1.5 py-0.5 border border-[#E2E8F0]">HEIC</span>
                          <span>· Up to 10 MB</span>
                        </div>
                        <input
                          type="file"
                          accept={BILL_ACCEPT}
                          aria-labelledby="bill-label"
                          className="sr-only"
                          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    {fileError && <p className="mt-2 text-[0.86rem] font-bold text-[#B42318]">{fileError}</p>}
                    <p className="mt-2 text-[0.78rem] text-[#64748B]">
                      🔒 Stored securely and only reviewed by Horace Lawrence to analyze your past 12 months kWh consumption before the call.
                    </p>
                  </div>

                  <MeterFields values={meter} onChange={setMeter} />

                  {formError && <Notice tone="error">{formError}</Notice>}

                  <Button
                    type="submit"
                    variant={slot ? 'accent' : 'primary'}
                    disabled={submitting}
                    className="min-h-[52px] w-full text-[1rem] shadow-md"
                  >
                    {submitting ? (
                      <>
                        <Spinner className="h-5 w-5" /> Confirming your appointment…
                      </>
                    ) : slot ? (
                      `Confirm Consultation · ${formatTime(slot.start)} on ${formatShortDay(slot.start)}`
                    ) : (
                      'Pick a date and time above'
                    )}
                  </Button>
                </form>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Confirmation({ slot, hadBill, meterStatus }: { slot: Slot; hadBill: boolean; meterStatus: string | null }) {
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-[#E2E8F0] bg-white p-7 text-center shadow-[0_12px_40px_rgba(10,20,40,0.06)] sm:p-10">
      <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#DCFCE7] shadow-sm">
        <CalendarCheck className="h-8 w-8 text-[#166534]" />
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-3 py-1 text-[0.75rem] font-bold uppercase tracking-wider text-[#065F46] border border-[#A7F3D0]">
        Appointment Confirmed
      </span>
      <h1 className="m-0 mt-3 text-2xl font-extrabold tracking-tight text-[#1A1A2E]">You're on the calendar!</h1>
      
      <div className="mt-5 rounded-2xl border border-[#FFD0AD] bg-[#FFFBF7] p-4 text-center">
        <p className="m-0 text-[1.1rem] font-extrabold text-[#1A1A2E]">
          {formatDay(slot.start)}
        </p>
        <p className="m-0 mt-1 text-[0.95rem] font-bold text-[#FF6B00]">
          {formatTime(slot.start)} – {formatTime(slot.end)} (Central Time)
        </p>
      </div>

      <p className="mt-5 text-[0.94rem] leading-relaxed text-[#4A5568]">
        Horace Lawrence (Sunrun Solar Advisor) has been notified and will reach out with your video conference link or phone call.
        {hadBill ? ' Thank you for attaching your electric bill — Horace will prepare your preliminary roof & solar sizing model beforehand.' : ''}
        {meterStatus ? ` ${usageStatusCopy(meterStatus)}` : ''}
      </p>

      <div className="mt-6 border-t border-[#F1F5F9] pt-4 text-xs text-[#64748B]">
        Need to reschedule or questions? Call or text <a className="font-bold text-[#0066CC] underline" href="tel:+15102417007">510-241-7007</a>.
      </div>
      
      <a
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-2.5 text-sm font-bold text-[#1A1A2E] shadow-sm hover:border-[#1A1A2E] hover:bg-white no-underline transition-all"
      >
        Return to The Power Genie
      </a>
    </div>
  );
}
