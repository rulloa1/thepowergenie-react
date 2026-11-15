import { lazy, Suspense, useEffect, useState } from 'react';
import { conferenceApi, type ActiveRoom } from './conferenceApi';
import { ConferenceRoomButton } from './ConferenceRoomButton';
import type { Lead } from './useLeadFeed';
import { Notice, Spinner } from './ui';
import { classifyConferenceProblem, conferenceProblemCopy } from './conferenceSetup';

const ConferenceSheet = lazy(() => import('./ConferenceRoom').then((mod) => ({ default: mod.ConferenceSheet })));

/**
 * Top-level Conference room page. Horace (owner) and Rory (admin) both see it.
 * Sample mode still shows the buttons; a live room starts only after sign-in.
 */
export default function ConferenceDesk({ leads, sample }: { leads: Lead[]; sample: boolean }) {
  const customers = leads.filter((lead) => lead.source === 'customer' && !lead.archived);
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [note, setNote] = useState<{ title: string; body: string } | null>(null);
  const [pick, setPick] = useState<Lead | null>(null);

  useEffect(() => {
    if (sample) return;
    let alive = true;
    const load = () => {
      conferenceApi.status().then((result) => {
        if (!alive) return;
        const problem = classifyConferenceProblem(result);
        setNote(problem ? conferenceProblemCopy(problem, result.error || null) : null);
      }).catch((reason: Error) => {
        if (!alive) return;
        const problem = classifyConferenceProblem({ configured: false, error: reason.message }) || 'livekit';
        setNote(conferenceProblemCopy(problem, reason.message));
      });
      conferenceApi.rooms().then((result) => {
        if (alive) setRooms(result.rooms);
      }).catch(() => {
        if (alive) setRooms([]);
      });
    };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [sample]);

  return (
    <section aria-label="Conference room" className="rounded-3xl bg-hub-surface p-4 sm:p-6">
      <h2 className="m-0 text-2xl font-bold tracking-tight text-hub-ink">Conference room</h2>
      <p className="m-0 mt-2 max-w-prose text-base leading-relaxed text-hub-soft">
        Pick a customer to start a video room, or join one that is already open. Horace and Rory both use this page.
      </p>
      {sample && (
        <div className="mt-4">
          <Notice tone="info" title="Sample desk">
            The Conference room button is here so you can see where it lives. Sign in to start a real room.
          </Notice>
        </div>
      )}
      {note && (
        <div className="mt-4">
          <Notice tone="warn" title={note.title}>{note.body}</Notice>
        </div>
      )}

      <h3 className="m-0 mt-8 text-lg font-bold text-hub-ink">Open rooms</h3>
      {sample || rooms.length === 0 ? (
        <p className="m-0 mt-2 text-base text-hub-soft">No rooms open right now.</p>
      ) : (
        <ul className="m-0 mt-3 grid list-none gap-3 p-0">
          {rooms.map((room) => {
            const lead = customers.find((item) => item.id === room.customerId) || leads.find((item) => item.id === room.customerId);
            return (
              <li key={room.customerId} className="flex flex-col gap-3 rounded-2xl border border-hub-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="m-0 text-lg font-bold text-hub-ink">{room.customerName}</p>
                  <p className="m-0 mt-1 text-base text-hub-soft">Room is open</p>
                </div>
                <ConferenceRoomButton
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (lead) setPick(lead);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="m-0 mt-8 text-lg font-bold text-hub-ink">Choose a customer</h3>
      {customers.length === 0 ? (
        <p className="m-0 mt-2 text-base text-hub-soft">No customers yet. Add one on the Customers tab, then start a room from here.</p>
      ) : (
        <ul className="m-0 mt-3 grid list-none gap-3 p-0">
          {customers.map((lead) => (
            <li key={lead.id} className="flex flex-col gap-3 rounded-2xl border border-hub-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="m-0 text-lg font-bold text-hub-ink">{lead.name}</p>
                <p className="m-0 mt-1 text-base text-hub-soft">{lead.address || 'No address yet'}</p>
              </div>
              <ConferenceRoomButton className="w-full sm:w-auto" onClick={() => setPick(lead)} />
            </li>
          ))}
        </ul>
      )}

      {pick && (
        <Suspense fallback={null}>
          <ConferenceSheet
            customerId={pick.id}
            customerName={pick.name}
            sample={sample}
            onClose={() => setPick(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
