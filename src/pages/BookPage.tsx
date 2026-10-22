import { useEffect, useState } from 'react';
import { isNotConfiguredResult, publicFetch, readMessage, readSlots } from '../lib/api';
import { validateCustomer } from '../lib/bookingForm';
import {
  formatChicagoDay,
  formatChicagoTime,
  generateOpenSlots,
  groupSlotsByChicagoDay,
} from '../lib/slots';
import { FriendlyBoundary } from '../components/dashboard/NotConfigured';
import {
  CustomerFields,
  Notice,
  SiteShell,
  TopBar,
  emptyCustomer,
  primaryButtonClass,
  secondaryButtonClass,
  usePageTitle,
  type CustomerFormValues,
} from '../components/dashboard/ui';

type Phase =
  | { name: 'loading' }
  | { name: 'not_configured' }
  | { name: 'error'; message: string }
  | { name: 'ready' }
  | { name: 'done'; startsAt: string; endsAt: string };

export default function BookPage() {
  if (import.meta.env.DEV) {
    const flag = new URLSearchParams(window.location.search).get('preview');
    if (flag === 'open-slots') {
      return (
        <FriendlyBoundary title="Book a call">
          <BookExperience preview />
        </FriendlyBoundary>
      );
    }
  }
  return (
    <FriendlyBoundary title="Book a call">
      <BookExperience />
    </FriendlyBoundary>
  );
}

function BookExperience({ preview = false }: { preview?: boolean }) {
  usePageTitle('Book a call with Horace — The Power Genie');
  const [phase, setPhase] = useState<Phase>(preview ? { name: 'ready' } : { name: 'loading' });
  const [slots, setSlots] = useState<Date[]>(() => (preview ? generateOpenSlots({ now: new Date(), busy: [] }) : []));
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Date | null>(null);
  const [customer, setCustomer] = useState<CustomerFormValues>(emptyCustomer);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    const load = async () => {
      setPhase({ name: 'loading' });
      const result = await publicFetch('/api/availability');
      if (cancelled) return;
      if (isNotConfiguredResult(result)) {
        setPhase({ name: 'not_configured' });
        return;
      }
      const isoSlots = readSlots(result.json);
      if (!result.ok || !isoSlots) {
        setPhase({
          name: 'error',
          message: readMessage(result.json, "Open times can't be loaded right now. Please try again in a moment."),
        });
        return;
      }
      setSlots(isoSlots.map((iso) => new Date(iso)).filter((date) => !Number.isNaN(date.getTime())));
      setPhase({ name: 'ready' });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const groups = groupSlotsByChicagoDay(slots);
  const activeKey = dayKey && groups.some((group) => group.key === dayKey) ? dayKey : groups[0]?.key ?? null;
  const active = groups.find((group) => group.key === activeKey) ?? null;
  const selectedSlot = selected && active?.slots.some((slot) => slot.getTime() === selected.getTime()) ? selected : null;

  async function submit() {
    if (!selectedSlot) {
      setFormError('Pick an open time.');
      return;
    }
    const customerResult = validateCustomer(customer);
    if (!customerResult.ok) {
      setFormError(customerResult.message);
      return;
    }
    if (preview) {
      setFormError('Preview only. Booking runs on the server once it is configured.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const result = await publicFetch('/api/book', {
      method: 'POST',
      body: JSON.stringify({ slot: selectedSlot.toISOString(), ...customer }),
    });
    setSubmitting(false);
    if (isNotConfiguredResult(result)) {
      setPhase({ name: 'not_configured' });
      return;
    }
    if (!result.ok || !result.json || typeof result.json !== 'object') {
      setFormError(readMessage(result.json, 'That time could not be booked. Pick another open slot.'));
      if (result.status === 409) {
        const refresh = await publicFetch('/api/availability');
        const isoSlots = readSlots(refresh.json);
        if (isoSlots) setSlots(isoSlots.map((iso) => new Date(iso)));
      }
      return;
    }
    const record = result.json as { startsAt?: unknown; endsAt?: unknown };
    if (typeof record.startsAt !== 'string' || typeof record.endsAt !== 'string') {
      setFormError('That time could not be booked. Please try again.');
      return;
    }
    setPhase({ name: 'done', startsAt: record.startsAt, endsAt: record.endsAt });
  }

  return (
    <SiteShell>
      <TopBar />
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
        {preview ? (
          <Notice tone="info">
            Local preview. These open times use the real hour rules and an empty calendar. A live booking checks Google Calendar on the server.
          </Notice>
        ) : null}
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">Book a call</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Book a call with Horace</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-[#4A5568]">
            One hour, weekdays, 9 AM to 8 PM Central. You only see times that are still open. The last call of the day starts at 7 PM, and a slot has to start at least one hour from now.
          </p>
        </div>

        {phase.name === 'loading' ? <p className="m-0 text-[#4A5568]">Loading open times…</p> : null}
        {phase.name === 'not_configured' ? (
          <section className="rounded-[18px] bg-white p-6 shadow-[0_12px_32px_rgba(10,20,40,0.08)]">
            <h2 className="m-0 text-2xl font-bold">Online booking is not configured yet</h2>
            <p className="mt-3 text-[#4A5568]">Please check back soon, or go back to the site to request a quote.</p>
            <a className={`${primaryButtonClass} mt-6`} href="/">Back to the site</a>
          </section>
        ) : null}
        {phase.name === 'error' ? (
          <section className="grid gap-3">
            <Notice tone="error">{phase.message}</Notice>
            <button type="button" className={secondaryButtonClass} onClick={() => window.location.reload()}>Try again</button>
          </section>
        ) : null}
        {phase.name === 'done' ? (
          <section className="rounded-[18px] bg-white p-6 shadow-[0_12px_32px_rgba(10,20,40,0.08)]">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">Confirmed</p>
            <h2 className="mt-2 text-2xl font-bold">You're booked with Horace</h2>
            <p className="mt-3 text-lg text-[#1A1A2E]">
              {formatChicagoDay(new Date(phase.startsAt))} at {formatChicagoTime(new Date(phase.startsAt))} Central.
            </p>
            <p className="text-[#4A5568]">He'll have your name, phone, email, and address for the call.</p>
            <a className={`${primaryButtonClass} mt-4`} href="/">Back to the site</a>
          </section>
        ) : null}
        {phase.name === 'ready' ? (
          <form
            className="grid gap-5 rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)] sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {groups.length === 0 ? (
              <p className="m-0 text-[#4A5568]">No open times in the next 30 days. Check back soon.</p>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Days with open times">
                  {groups.map((group) => {
                    const parts = group.key.split('-');
                    const active = group.key === activeKey;
                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => setDayKey(group.key)}
                        className={`min-w-16 shrink-0 rounded-2xl px-3 py-2 text-center ${active ? 'bg-[#0B2233] text-white' : 'bg-[#F4F7FB] text-[#1A1A2E]'}`}
                      >
                        <span className="block text-xs font-semibold">{group.label.split(',')[0]}</span>
                        <span className="block text-lg font-bold">{Number(parts[2])}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2" aria-label="Open times">
                  {active?.slots.map((slot) => {
                    const activeSlot = selectedSlot?.getTime() === slot.getTime();
                    return (
                      <button
                        key={slot.toISOString()}
                        type="button"
                        aria-pressed={activeSlot}
                        onClick={() => setSelected(slot)}
                        className={`min-h-11 rounded-full px-4 font-semibold ${activeSlot ? 'bg-[#FF6B00] text-white' : 'bg-[#F4F7FB] text-[#1A1A2E]'}`}
                      >
                        {formatChicagoTime(slot)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {selectedSlot ? (
              <p className="m-0 font-semibold">
                {formatChicagoDay(selectedSlot)} at {formatChicagoTime(selectedSlot)} Central
              </p>
            ) : null}
            {formError ? <Notice tone="error">{formError}</Notice> : null}
            <CustomerFields idPrefix="book" values={customer} onChange={setCustomer} yourDetails />
            <button type="submit" className={primaryButtonClass} disabled={submitting || groups.length === 0}>
              {submitting ? 'Booking…' : 'Book this time'}
            </button>
          </form>
        ) : null}
      </main>
    </SiteShell>
  );
}
