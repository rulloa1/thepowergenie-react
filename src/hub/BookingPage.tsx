import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, CalendarDays, Clock, FileUp, Phone, X } from 'lucide-react';
import { callFunction, supabase } from '../lib/supabase';
import { BrandMark, Button, Notice, NotConfigured, Spinner, cn, inputClass, labelClass } from './ui';
import { centralDateKey, formatBytes, formatDay, formatShortDay, formatTime } from './time';

interface Slot {
  start: string;
  end: string;
}

const MAX_BILL = 10 * 1024 * 1024;
const BILL_ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif';
const BILL_EXT = /\.(pdf|jpe?g|png|heic|heif)$/i;

type LoadState = 'loading' | 'ready' | 'not_configured' | 'unavailable' | 'error';

export default function BookingPage() {
  const [state, setState] = useState<LoadState>(supabase ? 'loading' : 'not_configured');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [bill, setBill] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Slot | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
    setDay((current) => {
      const keys = new Set(list.map((s) => centralDateKey(s.start)));
      return current && keys.has(current) ? current : list[0] ? centralDateKey(list[0].start) : null;
    });
    setSlot((current) => (current && list.some((s) => s.start === current.start) ? current : null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = centralDateKey(s.start);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()];
  }, [slots]);

  const daySlots = days.find(([k]) => k === day)?.[1] ?? [];

  const pickFile = (file: File | null) => {
    setFileError(null);
    if (!file) return setBill(null);
    if (!BILL_EXT.test(file.name)) {
      setBill(null);
      return setFileError('Please choose a PDF, JPG, PNG or HEIC file.');
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
        setFormError('Please choose an available day and time in Step 1 above to complete your booking.');
        document.getElementById('pick-time')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const bookingSlot = slot || {
      start: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      end: new Date(Date.now() + 25 * 3600 * 1000).toISOString(),
    };
    fd.set('start', bookingSlot.start);
    fd.delete('bill');
    if (bill) fd.set('bill', bill, bill.name);
    setSubmitting(true);
    const { error } = await callFunction<{ ok: boolean }>('booking', { body: fd });
    setSubmitting(false);
    if (error) {
      setFormError(error.message);
      if (error.status === 409) {
        setSlot(null);
        load();
      }
      return;
    }
    setBooked(bookingSlot);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (state === 'not_configured') return <NotConfigured what="Online booking" />;

  return (
    <div className="min-h-screen bg-[#F6F7FB] text-[#1A1A2E]">
      <header className="border-b border-[#E3E8EF] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/" aria-label="The Power Genie home">
            <BrandMark />
          </a>
          <a href="tel:+15102417007" className="inline-flex items-center gap-2 text-[0.92rem] font-semibold text-[#1A1A2E] no-underline">
            <Phone className="h-4 w-4 text-[#FF6B00]" /> <span className="hidden sm:inline">510-241-7007</span>
            <span className="sm:hidden">Call</span>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {booked ? (
          <Confirmation slot={booked} hadBill={!!bill} />
        ) : (
          <>
            <p className="m-0 text-[0.76rem] font-semibold uppercase tracking-[0.14em] text-[#FF6B00]">Free solar consultation</p>
            <h1 className="m-0 mt-2 text-[clamp(1.8rem,4vw,2.6rem)] font-bold leading-tight tracking-tight">
              Pick a time that works for you.
            </h1>
            <p className="mt-3 max-w-[56ch] text-[1.02rem] leading-relaxed text-[#4A5568]">
              One hour with Horace Lawrence, your Sunrun solar expert. He'll walk through your bill, your roof and how much
              you could save. All times are Central (Houston).
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              {/* Step 1: time */}
              <section aria-labelledby="pick-time" className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
                <h2 id="pick-time" className="m-0 flex items-center gap-2 text-lg font-bold">
                  <CalendarDays className="h-5 w-5 text-[#FF6B00]" /> 1. Choose a day and time
                </h2>

                {state === 'loading' && (
                  <div className="flex items-center gap-3 py-10 text-[#4A5568]">
                    <Spinner /> Finding open times…
                  </div>
                )}
                {state === 'unavailable' && (
                  <div className="mt-4">
                    <Notice tone="warn" title="Online booking is paused for a moment">
                      We couldn't confirm Horace's calendar right now. Please try again shortly, or call{' '}
                      <a href="tel:+15102417007" className="font-semibold">510-241-7007</a>.
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
                {state === 'ready' && days.length === 0 && (
                  <div className="mt-4">
                    <Notice title="No open times in the next 30 days">
                      Call <a href="tel:+15102417007" className="font-semibold">510-241-7007</a> and we'll find a time.
                    </Notice>
                  </div>
                )}

                {state === 'ready' && days.length > 0 && (
                  <>
                    <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Available days">
                      {days.map(([k, list]) => (
                        <button
                          key={k}
                          type="button"
                          role="option"
                          aria-selected={day === k}
                          onClick={() => {
                            setDay(k);
                            setSlot(null);
                          }}
                          className={cn(
                            'flex min-w-[84px] shrink-0 flex-col items-center rounded-2xl border px-3 py-2.5 text-center transition',
                            day === k
                              ? 'border-[#1A1A2E] bg-[#1A1A2E] text-white'
                              : 'border-[#E3E8EF] bg-white text-[#1A1A2E] hover:border-[#1A1A2E]',
                          )}
                        >
                          <span className="text-[0.74rem] font-semibold uppercase tracking-wide opacity-80">
                            {formatShortDay(list[0].start).split(',')[0]}
                          </span>
                          <span className="text-[1rem] font-bold">{formatShortDay(list[0].start).split(', ')[1]}</span>
                          <span className="text-[0.72rem] opacity-70">{list.length} open</span>
                        </button>
                      ))}
                    </div>

                    {day && (
                      <>
                        <p className="mb-3 mt-4 text-[0.92rem] font-semibold text-[#4A5568]">{formatDay(daySlots[0].start)}</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label="Available times">
                          {daySlots.map((s) => (
                            <button
                              key={s.start}
                              type="button"
                              role="option"
                              aria-selected={slot?.start === s.start}
                              onClick={() => {
                                setSlot(s);
                                setFormError(null);
                                if (window.innerWidth < 1024) {
                                  setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                                }
                              }}
                              className={cn(
                                'min-h-[46px] rounded-xl border text-[0.95rem] font-semibold transition',
                                slot?.start === s.start
                                  ? 'border-[#FF6B00] bg-[#FF6B00] text-white'
                                  : 'border-[#E3E8EF] bg-white hover:border-[#FF6B00] hover:text-[#C2410C]',
                              )}
                            >
                              {formatTime(s.start)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>

              {/* Step 2: details */}
              <section aria-labelledby="your-details" className="rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
                <h2 id="your-details" className="m-0 flex items-center gap-2 text-lg font-bold">
                  <Clock className="h-5 w-5 text-[#FF6B00]" /> 2. Your details
                </h2>

                <form ref={formRef} onSubmit={submit} className="mt-4 grid gap-4 scroll-mt-6" noValidate={false}>
                  <div
                    className={cn(
                      'rounded-2xl border px-4 py-3 text-[0.95rem]',
                      slot ? 'border-[#FFD0AD] bg-[#FFF5EC]' : 'border-dashed border-[#D6DCE5] text-[#6B7280]',
                    )}
                    aria-live="polite"
                  >
                    {slot ? (
                      <>
                        <span className="font-semibold">{formatDay(slot.start)}</span> · {formatTime(slot.start)} –{' '}
                        {formatTime(slot.end)} <span className="text-[#6B7280]">Central</span>
                      </>
                    ) : (
                      'Choose a time first.'
                    )}
                  </div>

                  {/* Honeypot — hidden from people, tempting to bots. */}
                  <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                    <label>
                      Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>

                  <div>
                    <label htmlFor="b-name" className={labelClass}>Full name</label>
                    <input id="b-name" name="name" required maxLength={120} autoComplete="name" className={inputClass} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="b-phone" className={labelClass}>Phone</label>
                      <input id="b-phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="b-email" className={labelClass}>Email</label>
                      <input id="b-email" name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="b-address" className={labelClass}>Home address</label>
                    <input id="b-address" name="address" required maxLength={300} autoComplete="street-address" placeholder="Street, city, ZIP" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="b-note" className={labelClass}>
                      Anything we should know? <span className="font-normal text-[#6B7280]">(optional)</span>
                    </label>
                    <textarea id="b-note" name="note" rows={3} maxLength={1000} className={cn(inputClass, 'resize-y')} />
                  </div>

                  <div>
                    <span className={labelClass} id="bill-label">Upload last month's light bill</span>
                    {bill ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#BFE3C6] bg-[#EEF9F0] px-3.5 py-3">
                        <span className="min-w-0 truncate text-[0.92rem]">
                          <span className="font-semibold">{bill.name}</span>{' '}
                          <span className="text-[#4A5568]">· {formatBytes(bill.size)}</span>
                        </span>
                        <button type="button" onClick={() => pickFile(null)} className="shrink-0 rounded-full p-1.5 hover:bg-white" aria-label="Remove file">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-[#D6DCE5] bg-[#FAFBFD] px-4 py-5 text-center transition hover:border-[#FF6B00]">
                        <FileUp className="h-6 w-6 text-[#FF6B00]" />
                        <span className="text-[0.95rem] font-semibold">Tap to add your bill</span>
                        <span className="text-[0.8rem] text-[#6B7280]">PDF, JPG, PNG or HEIC · up to 10 MB · a phone photo works</span>
                        <input
                          type="file"
                          accept={BILL_ACCEPT}
                          aria-labelledby="bill-label"
                          className="sr-only"
                          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    {fileError && <p className="mt-2 text-[0.86rem] font-medium text-[#B42318]">{fileError}</p>}
                    <p className="mt-2 text-[0.8rem] text-[#6B7280]">
                      Your bill is stored privately and only seen by your solar expert. It helps him size your system before you meet.
                    </p>
                  </div>

                  {formError && <Notice tone="error">{formError}</Notice>}

                  <Button type="submit" disabled={submitting} className="min-h-[52px] w-full text-[1rem]">
                    {submitting ? (
                      <>
                        <Spinner className="h-4 w-4" /> Booking…
                      </>
                    ) : slot ? (
                      `Book ${formatTime(slot.start)} on ${formatShortDay(slot.start)}`
                    ) : (
                      'Choose a time above or tap to book'
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

function Confirmation({ slot, hadBill }: { slot: Slot; hadBill: boolean }) {
  return (
    <div className="mx-auto max-w-lg rounded-3xl bg-white p-7 text-center shadow-[0_10px_30px_rgba(10,20,40,0.08)] sm:p-10">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#EEF9F0]">
        <CalendarCheck className="h-7 w-7 text-[#1E7B34]" />
      </span>
      <h1 className="m-0 text-2xl font-bold tracking-tight">You're booked!</h1>
      <p className="mt-3 text-[1.05rem]">
        <span className="font-semibold">{formatDay(slot.start)}</span>
        <br />
        {formatTime(slot.start)} – {formatTime(slot.end)} Central
      </p>
      <p className="mt-4 text-[#4A5568]">
        Horace Lawrence will reach out before your consultation.
        {hadBill ? ' Thanks for sending your light bill — he will review it ahead of time.' : ''}
      </p>
      <p className="mt-6 text-sm text-[#4A5568]">
        Need to change it? Call <a className="font-semibold text-[#0066CC]" href="tel:+15102417007">510-241-7007</a>.
      </p>
      <a href="/" className="mt-6 inline-block text-sm font-semibold text-[#0066CC]">Back to The Power Genie</a>
    </div>
  );
}
