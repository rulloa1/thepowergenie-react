import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  MediaDeviceSelect,
  useParticipants,
  useRemoteParticipants,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, MediaDeviceFailure, Track, LocalAudioTrack } from 'livekit-client';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import './conference.css';
import SpaceshipBackground from './SpaceshipBackground';
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
  const [deviceNote, setDeviceNote] = useState<string | null>(null);
  const [adminVoice, setAdminVoice] = useState(false);
  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    let alive = true;
    setAdminVoice(false);
    if (!isHost) return;
    void (async () => {
      const { supabase } = await import('../lib/supabase');
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!id) return;
      const profile = await supabase.from('hub_profiles').select('role').eq('id', id).maybeSingle();
      if (alive && !profile.error) setAdminVoice(profile.data?.role === 'admin');
    })().catch(() => {});
    return () => { alive = false; };
  }, [isHost]);

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
    <div className="pg-conference hub-canvas fixed inset-0 z-[85] flex h-dvh min-h-0 flex-col overflow-hidden font-[family:var(--sw-font-body)] text-hub-ink">
      <header className="pg-conference-header flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 shrink-0" />
          <span className="pg-sunrun">sunrun</span>
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
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={`pg-call relative min-h-0 min-w-0 flex-1 flex-col ${side !== 'call' ? 'hidden lg:flex' : 'flex'}`} data-lk-theme="default">
          {connectionNote && (
            <p className="m-0 shrink-0 bg-hub-warn px-3 py-2 text-[0.86rem] text-hub-warn-ink" role="status">{connectionNote}</p>
          )}
          {deviceNote && <div className="pg-device-notice" role="status"><p>{deviceNote}</p><button type="button" aria-label="Dismiss device message" onClick={() => setDeviceNote(null)}><X size={18} /></button></div>}
          <div className="relative min-h-0 min-w-0 flex-1">
            <LiveKitRoom
              serverUrl={join.serverUrl}
              token={join.token}
              connect
              audio={false}
              options={{ audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }}
              video={false}
              onError={(error) => {
                const failure = MediaDeviceFailure.getFailure(error);
                if (failure && failure !== MediaDeviceFailure.Other) setDeviceNote(deviceFailureCopy(failure));
                else setConnectionNote(plainConnectionNote(error.message));
              }}
              onMediaDeviceFailure={(failure, kind) => setDeviceNote(deviceFailureCopy(failure, kind))}
              onDisconnected={() => setConnectionNote('The video connection closed. Use Leave when you are finished.')}
              style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              <StartRoomDevices camera={startWithCamera} onProblem={setDeviceNote} />
              <RoomPresence />
              {!isHost && <WaitingForHost />}
              <SpaceshipBackground host={isHost} onProblem={setDeviceNote} />
              <VideoConference />
              <RoomAudioSettings onProblem={setDeviceNote} showVoiceSetup={adminVoice} />
            </LiveKitRoom>
          </div>
        </div>
        <aside className={`flex w-full flex-col border-hub-line lg:w-[340px] lg:shrink-0 lg:flex-none lg:border-l ${side === 'call' ? 'shrink-0' : 'min-h-0 flex-1'}`}>
          {isHost && customerId && <div className="pg-conference-queue max-h-[28dvh] shrink-0 overflow-y-auto empty:hidden"><WaitingList customerId={customerId} /></div>}
          <div className="hidden gap-1 border-b border-hub-line p-2 lg:flex" role="tablist" aria-label="Room sections">
            <SideTab current={side === 'chat' ? 'chat' : 'proposal'} id="proposal" onSelect={setSide}>Proposal</SideTab>
            {isHost && <SideTab current={side} id="chat" onSelect={setSide}>Team chat</SideTab>}
          </div>
          <div className={`min-h-0 flex-1 flex-col overflow-y-auto ${side === 'chat' ? 'hidden' : 'flex'} ${side === 'call' ? 'max-lg:hidden' : ''}`}>
            {join.proposalUrl ? (
              <><a className="pg-signing-link" href={join.proposalUrl} target="_blank" rel="noopener noreferrer">Open proposal / Sunrun signing ↗</a><iframe title={`Proposal for ${join.customerName}`} src={join.proposalUrl} className="min-h-0 w-full flex-1 border-0 bg-white" /></>
            ) : (
              <div className="m-3 rounded-xl border border-hub-line bg-hub-surface p-4">
                <FileText className="mb-3 h-5 w-5 text-hub-link" aria-hidden="true" />
                <h3 className="m-0 text-sm font-bold">No proposal linked yet</h3>
                <p className="mb-0 mt-2 text-sm leading-relaxed text-hub-soft">Your host can share their screen to review the proposal. Signing happens in Sunrun’s packet.</p>
              </div>
            )}
          </div>
          {isHost && (
            <div className={`min-h-0 flex-1 flex-col lg:min-h-0 ${side === 'chat' ? 'flex' : 'hidden'}`}>
              <p className="m-0 border-b border-hub-line px-3 py-2 text-[0.78rem] text-hub-soft">Team chat is visible to staff only. Use the call toolbar to chat with everyone.</p>
              <Suspense fallback={<div className="p-6 text-center"><Spinner /></div>}>
                <HostChat />
              </Suspense>
            </div>
          )}
        </aside>
      </div>
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

function deviceFailureCopy(failure?: MediaDeviceFailure, kind?: MediaDeviceKind): string {
  const device = kind === 'audioinput' ? 'Microphone' : kind === 'videoinput' ? 'Camera' : 'Camera or microphone';
  if (failure === MediaDeviceFailure.PermissionDenied) return `${device} access is blocked. Open the site controls beside your browser’s address, allow the device, then use its button in the call bar. Also check your computer or phone’s privacy settings. You can stay in the room with the device off.`;
  if (failure === MediaDeviceFailure.NotFound) return `${device} was not found. Connect a device or choose another in the call bar. You can stay in the room.`;
  if (failure === MediaDeviceFailure.DeviceInUse) return `${device} could not start. Close other apps using it, then try its button in the call bar.`;
  return `${device} could not start. Check the device and browser permissions, then try its button in the call bar.`;
}

function StartRoomDevices({ camera, onProblem }: { camera: boolean; onProblem: (message: string) => void }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const started = useRef(false);
  useEffect(() => {
    if (connection !== 'connected' || started.current) return;
    started.current = true;
    void room.localParticipant.setMicrophoneEnabled(true).catch((error: Error) => onProblem(deviceFailureCopy(MediaDeviceFailure.getFailure(error), 'audioinput')));
    if (camera) void room.localParticipant.setCameraEnabled(true).catch((error: Error) => onProblem(deviceFailureCopy(MediaDeviceFailure.getFailure(error), 'videoinput')));
  }, [room, connection, camera, onProblem]);
  return null;
}

function RoomPresence() {
  const participants = useParticipants();
  const connection = useConnectionState();
  return <div className="pg-presence" role="status"><span className="pg-connection">{connection} · {participants.length} in room</span></div>;
}

function RoomAudioSettings({ onProblem, showVoiceSetup }: { onProblem: (message: string) => void; showVoiceSetup: boolean }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const connectCocina = async () => {
    setBusy(true);
    setStatus(null);
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((device) => device.kind === 'audioinput' && device.label)) {
        const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
        permission.getTracks().forEach((track) => track.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
      }
      const cable = devices.find((device) => device.kind === 'audioinput' && /^CABLE Output(?:\s|$)/i.test(device.label));
      if (!cable) throw new Error('CABLE Output is unavailable. Start Cocina Voice and enable VB-CABLE in Windows Sound.');
      const options = { deviceId: { exact: cable.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      await room.switchActiveDevice('audioinput', cable.deviceId);
      const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (track instanceof LocalAudioTrack) await track.restartTrack(options);
      await room.localParticipant.setMicrophoneEnabled(true, options);
      setStatus('CABLE Output selected. This room is ready to receive Cocina Voice audio.');
    } catch (error) {
      const failure = MediaDeviceFailure.getFailure(error);
      const message = failure && failure !== MediaDeviceFailure.Other ? deviceFailureCopy(failure, 'audioinput') : error instanceof Error ? error.message : 'Could not connect Cocina Voice.';
      setStatus(message);
      onProblem(message);
    } finally { setBusy(false); }
  };
  return (
    <details className="pg-audio-settings">
      <summary>Audio devices</summary>
      <div>
        <span>Microphone</span>
        <MediaDeviceSelect kind="audioinput" aria-label="Microphone devices" onDeviceSelectError={(error) => onProblem(deviceFailureCopy(MediaDeviceFailure.getFailure(error), 'audioinput'))} />
        <span>Speaker</span>
        <MediaDeviceSelect kind="audiooutput" aria-label="Speaker devices" onDeviceSelectError={(error) => onProblem(`Speaker could not switch: ${error.message}`)} />
        {showVoiceSetup && (
          <details className="pg-cocina-help">
            <summary>Cocina Voice · Emilia Cruz</summary>
            <p>In Cocina Voice, choose CABLE Input as the sound output. Use headphones for this room’s speakers.</p>
            <button type="button" className="lk-button" disabled={busy || connection !== 'connected'} onClick={() => void connectCocina()}>{busy ? 'Connecting…' : 'Use Cocina Voice'}</button>
            {connection !== 'connected' && <p>Connect to the room before selecting Cocina Voice.</p>}
            <p>For a separate voice participant, join the invite as Emilia Cruz with the camera off. In Cocina Voice, select Answer conference questions and share this meeting tab with tab audio.</p>
            {status && <p role="status">{status}</p>}
          </details>
        )}
        <p>Speaker selection depends on your browser. Otherwise use your system sound settings.</p>
      </div>
    </details>
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
  if (/permission denied|notallowederror/i.test(message)) return 'Device access was denied. Allow microphone access in this site’s browser permissions, then enable the microphone in the call bar.'
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
    <div className="pg-room-overlay fixed inset-0 z-[85] flex items-end justify-center bg-hub-scrim sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="conference-title" onClick={(event) => event.stopPropagation()} className="pg-conference pg-room-sheet hub-canvas w-full max-w-lg rounded-t-3xl border border-hub-line p-5 font-[family:var(--sw-font-body)] text-hub-ink sm:rounded-3xl sm:p-6">
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
