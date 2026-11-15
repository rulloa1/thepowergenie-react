import React, { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import { ConferenceCall } from '../hub/ConferenceRoom';
import { conferenceApi, ConferenceError, type JoinInfo } from '../hub/conferenceApi';
import { Button, Notice, Spinner, inputClass, labelClass } from '../hub/ui';

export default function ConferenceJoinPage({ token }: { token: string | null }) {
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [guestId, setGuestId] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    document.title = 'Conference room — The Power Genie';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    conferenceApi.lobby(token).then((lobby) => {
      if (!alive) return;
      setCustomerName(lobby.customerName);
      setLoading(false);
    }).catch((reason: Error) => {
      if (!alive) return;
      setError(reason.message);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !guestId || join || denied) return;
    let alive = true;
    const tick = () => {
      conferenceApi.guest(token, guestId).then((result) => {
        if (!alive) return;
        if (result.status === 'admitted') setJoin(result);
        if (result.status === 'denied') setDenied(true);
      }).catch((reason: Error) => {
        if (alive) setError(reason.message);
      });
    };
    tick();
    const timer = window.setInterval(tick, 2500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token, guestId, join, denied]);

  const knock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const result = await conferenceApi.knock(token, name);
      setGuestId(result.guestId);
    } catch (reason) {
      setError(reason instanceof ConferenceError ? reason.message : 'Could not join the waiting room.');
    }
  };

  if (join) {
    return <ConferenceCall join={join} isHost={false} onLeave={() => { setJoin(null); setGuestId(null); }} />;
  }

  return (
    <div className="hub-canvas flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-hub-surface p-6 text-hub-ink shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-hub-accent-ink">The Power Genie</p>
        <h1 className="m-0 mt-1 text-2xl font-bold">Join the call</h1>
        {loading && <div className="mt-6"><Spinner /></div>}
        {!token && <div className="mt-4"><Notice tone="error">This invite link is incomplete. Ask Horace or Rory for a new one.</Notice></div>}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        {customerName && !guestId && !denied && (
          <form className="mt-5 grid gap-4" onSubmit={(event) => void knock(event)}>
            <p className="m-0 text-[0.95rem] leading-relaxed text-hub-soft">
              You are invited to a video call about {customerName}. Enter your name. Horace or Rory will let you in. You do not need an account.
            </p>
            <div>
              <label htmlFor="guest-name" className={labelClass}>Your name</label>
              <input id="guest-name" required maxLength={40} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
            </div>
            <Button type="submit" variant="accent" className="w-full">
              <Video className="h-4 w-4" /> Ask to join
            </Button>
          </form>
        )}
        {guestId && !denied && (
          <div className="mt-5">
            <Notice tone="info" title="Waiting for the host">Keep this page open. You will join the video call when Horace or Rory lets you in.</Notice>
            <div className="mt-4 flex justify-center"><Spinner /></div>
          </div>
        )}
        {denied && <div className="mt-5"><Notice tone="warn">The host did not let you in this time. Ask them for a new link if the call is still on.</Notice></div>}
      </div>
    </div>
  );
}
