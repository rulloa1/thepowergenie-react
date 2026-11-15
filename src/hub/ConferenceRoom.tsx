import React, { lazy, Suspense, useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import { Copy, Phone, Video, X } from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import type { Profile } from './Dashboard';
import { conferenceApi, ConferenceError, type JoinInfo, type WaitingGuest } from './conferenceApi';
import { Button, Notice, Spinner } from './ui';

const ChatTab = lazy(() => import('./ChatTab'));

const SETUP = 'Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET on Vercel (Production), then redeploy. LIVEKIT_URL is already wss://thepowergenie-conference-room-m4nzqnpy.livekit.cloud. Do not put the secret in a VITE_ variable.';

function inviteHref(path: string): string {
  return `${window.location.origin}${path}`;
}

export function ConferenceCall({
  join,
  isHost,
  customerId,
  startWithCamera = true,
  onLeave,
}: {
  join: JoinInfo;
  isHost: boolean;
  customerId?: string;
  /** Customers can join with the camera off and turn it on from the call bar. */
  startWithCamera?: boolean;
  onLeave: () => void;
}) {
  const [side, setSide] = useState<'call' | 'proposal' | 'chat'>('call');
  const [copied, setCopied] = useState(false);
  const [connectionNote, setConnectionNote] = useState<string | null>(null);
  useEffect(() => lockPageScroll(), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteHref(join.invitePath));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link', inviteHref(join.invitePath));
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#071b27] text-hub-ink">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hub-line px-3 py-2">
        <div className="min-w-0">
          <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-hub-accent-ink">Conference room</p>
          <h2 className="m-0 truncate text-base font-bold">{join.customerName}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isHost && (
            <Button type="button" variant="ghost" className="min-h-11 px-3 text-[0.84rem]" onClick={() => void copy()}>
              <Copy className="h-4 w-4" /> {copied ? 'Link copied' : 'Copy client link'}
            </Button>
          )}
          <Button type="button" variant="danger" className="min-h-11 px-3" onClick={onLeave}>
            <Phone className="h-4 w-4" /> Leave
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={`pg-call relative min-h-0 flex-1 ${side !== 'call' ? 'hidden lg:block' : ''}`} data-lk-theme="default">
          <style>{`.pg-call .lk-toast{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5}`}</style>
          <LiveKitRoom
            serverUrl={join.serverUrl}
            token={join.token}
            connect
            audio
            video={startWithCamera}
            onError={(error) => setConnectionNote(error.message)}
            onDisconnected={() => setConnectionNote('The video connection closed. Use Leave when you are finished.')}
            style={{ height: '100%' }}
          >
            {connectionNote && (
              <p className="m-0 bg-hub-warn px-3 py-2 text-[0.86rem] text-hub-warn-ink" role="status">{connectionNote}</p>
            )}
            <VideoConference />
          </LiveKitRoom>
        </div>
        <aside className={`flex w-full flex-col border-hub-line lg:w-[340px] lg:border-l ${side === 'call' ? 'hidden lg:flex' : 'flex min-h-0 flex-1'}`}>
          <div className="hidden gap-1 border-b border-hub-line p-2 lg:flex" role="tablist" aria-label="Room sections">
            <SideTab current={side === 'chat' ? 'chat' : 'proposal'} id="proposal" onSelect={setSide}>Proposal</SideTab>
            {isHost && <SideTab current={side} id="chat" onSelect={setSide}>Team chat</SideTab>}
          </div>
          <div className="flex gap-1 border-b border-hub-line p-2 lg:hidden" role="tablist" aria-label="Room sections">
            <SideTab current={side} id="call" onSelect={setSide}>Call</SideTab>
            <SideTab current={side} id="proposal" onSelect={setSide}>Proposal</SideTab>
            {isHost && <SideTab current={side} id="chat" onSelect={setSide}>Team chat</SideTab>}
          </div>
          <div className={`min-h-0 flex-1 flex-col ${side === 'chat' ? 'hidden' : side === 'proposal' || side === 'call' ? 'flex' : 'hidden'} ${side === 'call' ? 'max-lg:hidden' : ''}`}>
            {isHost && customerId && <WaitingList customerId={customerId} />}
            {join.proposalUrl ? (
              <iframe title={`Proposal for ${join.customerName}`} src={join.proposalUrl} className="min-h-[240px] w-full flex-1 border-0 bg-white" />
            ) : (
              <p className="m-0 p-4 text-[0.9rem] leading-relaxed text-hub-soft">
                No proposal link yet. Horace can share his screen and walk through the contract. Signing still happens in Sunrun’s own packet.
              </p>
            )}
          </div>
          {isHost && (
            <div className={`min-h-[40dvh] min-h-0 flex-1 flex-col lg:min-h-0 ${side === 'chat' ? 'flex' : 'hidden'}`}>
              <p className="m-0 border-b border-hub-line px-3 py-2 text-[0.78rem] text-hub-soft">Team chat stays between Rory and Horace. The client does not see it. Everyone on the call can use the chat button in the call bar.</p>
              <Suspense fallback={<div className="p-6 text-center"><Spinner /></div>}>
                <HostChat />
              </Suspense>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SideTab({ current, id, onSelect, children }: { current: string; id: 'call' | 'proposal' | 'chat'; onSelect: (id: 'call' | 'proposal' | 'chat') => void; children: React.ReactNode }) {
  const on = current === id;
  return (
    <button type="button" role="tab" aria-selected={on} onClick={() => onSelect(id)} className={`min-h-11 flex-1 rounded-xl px-2 text-[0.84rem] font-bold ${on ? 'bg-hub-primary text-hub-on-primary' : 'text-hub-soft'}`}>
      {children}
    </button>
  );
}

function HostChat() {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { supabase } = await import('../lib/supabase');
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!id) return;
      const row = await supabase.from('hub_profiles').select('id, email, full_name, role').eq('id', id).maybeSingle();
      if (alive && row.data) setProfile(row.data as Profile);
    })();
    return () => { alive = false; };
  }, []);
  if (!profile) return <div className="p-6 text-center"><Spinner /></div>;
  return <ChatTab profile={profile} />;
}

function WaitingList({ customerId }: { customerId: string }) {
  const [guests, setGuests] = useState<WaitingGuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    conferenceApi.queue(customerId).then((result) => { setGuests(result.guests); setError(null); }).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [customerId]);
  if (!guests.length && !error) return null;
  return (
    <div className="border-b border-hub-line p-3">
      <p className="m-0 text-[0.78rem] font-bold uppercase tracking-wide text-hub-soft">Waiting to come in</p>
      {error && <p className="m-0 mt-1 text-[0.82rem] text-hub-danger">{error}</p>}
      <ul className="m-0 mt-2 grid list-none gap-2 p-0">
        {guests.map((guest) => (
          <li key={guest.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.9rem] font-semibold">{guest.name}</span>
            <span className="flex gap-1">
              <Button type="button" variant="accent" className="min-h-11 px-3 text-[0.8rem]" onClick={() => void conferenceApi.admit(customerId, guest.id).then(load)}>Let in</Button>
              <Button type="button" variant="ghost" className="min-h-11 px-3 text-[0.8rem]" onClick={() => void conferenceApi.decline(customerId, guest.id).then(load)}>Not now</Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConferenceSheet({
  customerId,
  customerName,
  sample,
  onClose,
}: {
  customerId: string;
  customerName: string;
  sample: boolean;
  onClose: () => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(sample ? false : null);
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    if (sample) return;
    conferenceApi.status().then((result) => setConfigured(result.configured)).catch((reason: Error) => {
      setConfigured(false);
      setError(reason.message);
    });
  }, [sample]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await conferenceApi.start(customerId);
      setInvitePath(room.invitePath);
    } catch (reason) {
      setError(reason instanceof ConferenceError ? reason.message : 'Could not start the room.');
    } finally {
      setBusy(false);
    }
  };

  const host = async () => {
    setBusy(true);
    setError(null);
    try {
      setJoin(await conferenceApi.host(customerId));
    } catch (reason) {
      setError(reason instanceof ConferenceError ? reason.message : 'Could not join the room.');
    } finally {
      setBusy(false);
    }
  };

  if (join) return <ConferenceCall join={join} isHost customerId={customerId} onLeave={onClose} />;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-hub-scrim sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="conference-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-t-3xl bg-hub-surface p-5 text-hub-ink shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-hub-accent-ink">Conference room</p>
            <h2 id="conference-title" className="m-0 mt-1 text-xl font-bold">{customerName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-hub-line">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="m-0 mt-3 text-[0.92rem] leading-relaxed text-hub-soft">
          Rory, Horace, and the customer join the same video call. Horace can share his screen to walk through the contract. The customer waits until you let them in.
        </p>
        {sample && (
          <div className="mt-4"><Notice tone="info" title="Sample desk">Sign in to start a real room from this customer. Nothing here places a call.</Notice></div>
        )}
        {!sample && configured === null && <div className="mt-4"><Spinner /></div>}
        {!sample && configured === false && <div className="mt-4"><Notice tone="warn" title="LiveKit is not ready">{error || SETUP}</Notice></div>}
        {!sample && configured && (
          <div className="mt-4 grid gap-3">
            {error && <Notice tone="error">{error}</Notice>}
            {!invitePath ? (
              <Button type="button" variant="accent" disabled={busy} onClick={() => void start()}>
                {busy ? <Spinner className="h-4 w-4" /> : <Video className="h-4 w-4" />} Start room
              </Button>
            ) : (
              <>
                <p className="m-0 break-all rounded-xl bg-hub-muted px-3 py-2 text-[0.84rem]">{inviteHref(invitePath)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(inviteHref(invitePath)).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); })}>
                    <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy invite link'}
                  </Button>
                  <Button type="button" variant="accent" disabled={busy} onClick={() => void host()}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Video className="h-4 w-4" />} Join as host
                  </Button>
                </div>
                <WaitingList customerId={customerId} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
