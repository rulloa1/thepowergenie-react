import React, { lazy, Suspense, useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference, useConnectionState, useRemoteParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import { ConnectionState } from 'livekit-client';
import { Copy, FileText, Phone, Video, X } from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import type { Profile } from './Dashboard';
import { conferenceApi, ConferenceError, type JoinInfo, type WaitingGuest } from './conferenceApi';
import { classifyConferenceProblem, conferenceProblemCopy, type ConferenceProblem } from './conferenceSetup';
import { BrandMark, Button, Notice, Spinner } from './ui';
import './ConferenceRoom.css';

const ChatTab = lazy(() => import('./ChatTab'));

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
    <div className="pg-conference hub-canvas fixed inset-0 z-[85] flex flex-col font-[family:var(--sw-font-body)] text-hub-ink">
      <header className="pg-conference-header flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 shrink-0" />
          <div className="min-w-0">
            <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-hub-accent-ink">Conference room</p>
            <h2 className="m-0 truncate text-base font-bold">{join.customerName}</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isHost && (
            <Button type="button" variant="ghost" className="min-h-11 px-3 text-[0.84rem]" onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden="true" /> <span aria-live="polite">{copied ? 'Link copied' : 'Copy client link'}</span>
            </Button>
          )}
          <Button type="button" variant="danger" className="min-h-11 px-3" onClick={onLeave}>
            <Phone className="h-4 w-4" aria-hidden="true" /> Leave
          </Button>
        </div>
      </header>
      <nav className="pg-conference-nav mx-2 mt-2 flex lg:hidden" aria-label="Conference views">
        <SideTab current={side} id="call" onSelect={setSide}>Call</SideTab>
        <SideTab current={side} id="proposal" onSelect={setSide}>Proposal</SideTab>
        {isHost && <SideTab current={side} id="chat" onSelect={setSide}>Team chat</SideTab>}
      </nav>
      <div className="pg-conference-layout min-h-0 flex-1">
        <section aria-label="Video call" className={`pg-call relative min-h-0 min-w-0 ${side !== 'call' ? 'hidden lg:block' : ''}`} data-lk-theme="default">
          <LiveKitRoom
            serverUrl={join.serverUrl}
            token={join.token}
            connect
            audio
            video={startWithCamera}
            onError={(error) => setConnectionNote(plainConnectionNote(error.message))}
            onDisconnected={() => setConnectionNote('The video connection closed. Use Leave when you are finished.')}
            className="flex h-full flex-col"
          >
            {connectionNote && (
              <p className="m-0 bg-hub-warn px-3 py-2 text-[0.86rem] text-hub-warn-ink" role="status">{connectionNote}</p>
            )}
            {!isHost && <WaitingForHost />}
            <div className="min-h-0 flex-1">
              <VideoConference />
            </div>
          </LiveKitRoom>
        </section>
        <aside aria-label="Conference tools" data-view={side} className="pg-conference-tools flex min-h-0 min-w-0 flex-col">
          {isHost && customerId && <div className="pg-conference-queue max-h-[28dvh] shrink-0 overflow-y-auto empty:hidden"><WaitingList customerId={customerId} /></div>}
          <nav className="pg-conference-nav mx-2 mt-2 hidden lg:flex" aria-label="Conference tools">
            <SideTab current={side === 'chat' ? 'chat' : 'proposal'} id="proposal" onSelect={setSide}>Proposal</SideTab>
            {isHost && <SideTab current={side} id="chat" onSelect={setSide}>Team chat</SideTab>}
          </nav>
          <div className={`min-h-0 flex-1 flex-col overflow-y-auto ${side === 'chat' ? 'hidden' : 'flex'} ${side === 'call' ? 'max-lg:hidden' : ''}`}>
            {join.proposalUrl ? (
              <iframe title={`Proposal for ${join.customerName}`} src={join.proposalUrl} className="m-2 min-h-[240px] w-[calc(100%_-_1rem)] flex-1 rounded-xl border-0 bg-white" />
            ) : (
              <div className="m-3 rounded-xl border border-hub-line bg-hub-surface p-4">
                <FileText className="mb-3 h-5 w-5 text-hub-link" aria-hidden="true" />
                <h3 className="m-0 text-sm font-bold">No proposal linked yet</h3>
                <p className="mb-0 mt-2 text-sm leading-relaxed text-hub-soft">Your host can share their screen to review the proposal. Signing happens in Sunrun’s packet.</p>
              </div>
            )}
          </div>
          {isHost && (
            <div className={`min-h-0 flex-1 flex-col overflow-y-auto ${side === 'chat' ? 'flex' : 'hidden'}`}>
              <p className="m-0 border-b border-hub-line px-3 py-2 text-[0.78rem] text-hub-soft">Team chat is visible to staff only. Use the call toolbar to chat with everyone.</p>
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

function WaitingForHost() {
  const connectionState = useConnectionState();
  const participants = useRemoteParticipants();
  if (connectionState !== ConnectionState.Connected || participants.some(({ identity }) => identity.startsWith('host-'))) {
    return null;
  }

  return (
    <div className="pg-conference-wait" role="status">
      <div className="flex items-center gap-3">
        <img src="/assets/conference/sunrun-wordmark.webp" alt="Sunrun" className="h-5 w-auto object-contain" />
        <BrandMark className="h-7" />
      </div>
      <div>
        <p className="m-0 text-sm font-bold">Waiting for host</p>
        <p className="m-0 text-xs text-hub-soft">Keep this window open. Your host will appear when they connect.</p>
      </div>
    </div>
  );
}

function plainConnectionNote(message: string): string {
  if (/authorization|token|401/i.test(message)) return 'The room could not verify this join. Ask Horace or Rory to let you in again.'
  if (/signal|websocket|network|fetch/i.test(message)) return 'Could not reach the video service. Check your connection, then try again.'
  return message
}

function SideTab({ current, id, onSelect, children }: { current: string; id: 'call' | 'proposal' | 'chat'; onSelect: (id: 'call' | 'proposal' | 'chat') => void; children: React.ReactNode }) {
  const on = current === id;
  return (
    <button type="button" aria-pressed={on} onClick={() => onSelect(id)} className="min-h-11 flex-1 rounded-lg px-2 text-[0.84rem] font-bold">
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
            <span className="min-w-0">
              <span className="block truncate text-[0.9rem] font-semibold">{guest.name}</span>
              <span className="block text-[0.75rem] text-hub-soft">{guest.camera === false ? 'No video' : 'Camera on'}</span>
            </span>
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
  const [problem, setProblem] = useState<ConferenceProblem | null>(null);
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [hostCamera, setHostCamera] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    if (sample) return;
    conferenceApi.status().then((result) => {
      setConfigured(result.configured);
      setProblem(classifyConferenceProblem(result));
      setError(result.error || null);
    }).catch((reason: Error) => {
      setConfigured(false);
      setProblem(classifyConferenceProblem({ configured: false, error: reason.message }));
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

  if (join) return <ConferenceCall join={join} isHost customerId={customerId} startWithCamera={hostCamera} onLeave={onClose} />;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-hub-scrim sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="conference-title" onClick={(event) => event.stopPropagation()} className="hub-canvas w-full max-w-lg rounded-t-3xl border border-hub-line bg-hub-surface p-5 font-[family:var(--sw-font-body)] text-hub-ink shadow-[inset_0_-3px_0_#FF6B00,0_24px_60px_rgba(0,0,0,0.35)] sm:rounded-3xl sm:p-6">
        <BrandMark className="mb-4 h-8" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-hub-accent-ink">Conference room</p>
            <h2 id="conference-title" className="m-0 mt-1 text-2xl font-bold tracking-tight">{customerName}</h2>
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
        {!sample && configured === false && problem && (
          <div className="mt-4">
            <Notice tone="warn" title={conferenceProblemCopy(problem, error).title}>{conferenceProblemCopy(problem, error).body}</Notice>
          </div>
        )}
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
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-hub-line bg-hub-muted px-3">
                  <input type="checkbox" checked={hostCamera} onChange={(event) => setHostCamera(event.target.checked)} className="h-4 w-4 accent-[#ffcf75]" />
                  <span className="text-[0.9rem] font-semibold">Start with my camera on</span>
                </label>
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
