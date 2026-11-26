import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  VideoTrack,
  useTracks,
  MediaDeviceSelect,
  useParticipants,
  useRemoteParticipants,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, MediaDeviceFailure, Track, LocalAudioTrack, RoomEvent } from 'livekit-client';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import './conference.css';
import CallWrapUp from './CallWrapUp';
import { BackgroundProcessor, supportsBackgroundProcessors } from '@livekit/track-processors';
import { Copy, FileText, Phone, SlidersHorizontal, Sparkles, Video, X } from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import type { Profile } from './Dashboard';
import { conferenceApi, ConferenceError, type JoinInfo, type WaitingGuest } from './conferenceApi';
import { classifyConferenceProblem, conferenceProblemCopy, type ConferenceProblem } from './conferenceSetup';
import { BrandMark, Button, Notice, Spinner } from './ui';
import GenieWorldViewer, { type GenieWorldSyncState } from './GenieWorldViewer';
import './ConferenceRoom.css';

const ChatTab = lazy(() => import('./ChatTab'));

export type ConferenceSideTab = 'call' | 'proposal' | 'genie' | 'chat';

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
  const spaceshipSupported = !isHost || supportsBackgroundProcessors();
  const roomOptions = React.useMemo(() => ({
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    ...(isHost && { videoCaptureDefaults: {
      resolution: { width: 1280, height: 720, frameRate: 24 },
      processor: spaceshipSupported ? BackgroundProcessor({ mode: 'virtual-background', imagePath: new URL('/assets/conference/orbital-lounge.webp', window.location.origin).href }) : {
        name: 'spaceship-unavailable',
        async init() { throw new Error('This browser cannot separate the host from the camera background.'); },
        async restart() { throw new Error('Spaceship camera unavailable.'); },
        async destroy() {},
      },
    } }),
  }), [isHost, spaceshipSupported]);
  const [side, setSide] = useState<ConferenceSideTab>('call');
  const [presentMode, setPresentMode] = useState<'off' | 'proposal' | 'genie'>('off');
  const [hostGenieSync, setHostGenieSync] = useState<GenieWorldSyncState | null>(null);
  const [receivedGenieSync, setReceivedGenieSync] = useState<GenieWorldSyncState | null>(null);
  const [guestFollowHost, setGuestFollowHost] = useState(true);
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
            <Button
              type="button"
              variant={presentMode === 'genie' ? 'accent' : 'ghost'}
              className="min-h-11 px-3 text-[0.84rem]"
              onClick={() => setPresentMode((cur) => (cur === 'genie' ? 'off' : 'genie'))}
            >
              <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span>{presentMode === 'genie' ? 'Exit 3D World' : '3D World (Genie 4)'}</span>
            </Button>
          )}
          {isHost && join.proposalUrl && (
            <Button
              type="button"
              variant={presentMode === 'proposal' ? 'primary' : 'ghost'}
              className="min-h-11 px-3 text-[0.84rem]"
              onClick={() => setPresentMode((cur) => (cur === 'proposal' ? 'off' : 'proposal'))}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span>{presentMode === 'proposal' ? 'Exit presentation' : 'Present proposal'}</span>
            </Button>
          )}
          {/* Mobile responsive tab toggles */}
          <div className="flex items-center gap-1 lg:hidden">
            <Button
              type="button"
              variant={side === 'proposal' ? 'primary' : 'ghost'}
              className="min-h-11 px-2.5 text-xs"
              onClick={() => setSide((cur) => (cur === 'proposal' ? 'call' : 'proposal'))}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Proposal</span>
            </Button>
            <Button
              type="button"
              variant={side === 'genie' ? 'accent' : 'ghost'}
              className="min-h-11 px-2.5 text-xs"
              onClick={() => setSide((cur) => (cur === 'genie' ? 'call' : 'genie'))}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>3D Solar</span>
            </Button>
          </div>
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
              options={roomOptions}
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
              {
                !spaceshipSupported && <p role="status">Audio is available. Use a browser with hardware acceleration for the spaceship camera.</p>
              }
              <StartRoomDevices camera={startWithCamera && spaceshipSupported} onProblem={setDeviceNote} />
              <RoomPresence />
              <ConferencePresentationSync
                isHost={isHost}
                presentMode={presentMode}
                setPresentMode={setPresentMode}
                genieSyncState={isHost ? hostGenieSync : null}
                onGenieSyncReceived={!isHost ? setReceivedGenieSync : undefined}
              />
              {presentMode === 'genie' ? (
                <GeniePresentationStage
                  customerName={join.customerName}
                  onExit={() => setPresentMode('off')}
                  syncState={isHost ? hostGenieSync : receivedGenieSync}
                  onSyncChange={isHost ? setHostGenieSync : undefined}
                  followHost={!isHost ? guestFollowHost : false}
                  onToggleFollowHost={!isHost ? setGuestFollowHost : undefined}
                />
              ) : presentMode === 'proposal' && join.proposalUrl ? (
                <ProposalPresentationStage
                  proposalUrl={join.proposalUrl}
                  customerName={join.customerName}
                  onExit={() => setPresentMode('off')}
                />
              ) : isHost ? (
                <VideoConference />
              ) : (
                <GuestConference />
              )}
              <RoomAudioSettings onProblem={setDeviceNote} showVoiceSetup={adminVoice} />
            </LiveKitRoom>
          </div>
        </div>
        <aside className={`flex w-full flex-col border-hub-line lg:w-[340px] lg:shrink-0 lg:flex-none lg:border-l ${side === 'call' ? 'shrink-0' : 'min-h-0 flex-1'}`}>
          {isHost && customerId && <div className="pg-conference-queue max-h-[28dvh] shrink-0 overflow-y-auto empty:hidden"><WaitingList customerId={customerId} /></div>}
          <div className="hidden gap-1 border-b border-hub-line p-2 lg:flex" role="tablist" aria-label="Room sections">
            <SideTab current={side === 'call' ? 'proposal' : side} id="proposal" onSelect={setSide}>Proposal</SideTab>
            <SideTab current={side === 'call' ? 'proposal' : side} id="genie" onSelect={setSide}>
              <span className="flex items-center justify-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>3D Solar</span>
              </span>
            </SideTab>
            {isHost && <SideTab current={side === 'call' ? 'proposal' : side} id="chat" onSelect={setSide}>Team chat</SideTab>}
          </div>
          {/* Proposal tab */}
          <div className={`min-h-0 flex-1 flex-col overflow-y-auto ${side === 'proposal' || side === 'call' ? 'flex' : 'hidden'} ${side === 'call' ? 'max-lg:hidden' : ''}`}>
            {join.proposalUrl ? (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-hub-line p-2">
                  <a className="pg-signing-link m-0 text-xs" href={join.proposalUrl} target="_blank" rel="noopener noreferrer">
                    Open signing ↗
                  </a>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => setPresentMode((m) => (m === 'proposal' ? 'off' : 'proposal'))}
                      className="rounded-lg bg-hub-primary px-2.5 py-1 text-xs font-semibold text-hub-on-primary hover:opacity-90"
                    >
                      {presentMode === 'proposal' ? 'Stop stage' : 'Project to stage'}
                    </button>
                  )}
                </div>
                <iframe title={`Proposal for ${join.customerName}`} src={join.proposalUrl} className="min-h-0 w-full flex-1 border-0 bg-white" />
              </>
            ) : (
              <div className="m-3 rounded-xl border border-hub-line bg-hub-surface p-4">
                <FileText className="mb-3 h-5 w-5 text-hub-link" aria-hidden="true" />
                <h3 className="m-0 text-sm font-bold">No proposal linked yet</h3>
                <p className="mb-0 mt-2 text-sm leading-relaxed text-hub-soft">Your host can share their screen to review the proposal. Signing happens in Sunrun’s packet.</p>
              </div>
            )}
          </div>
          {/* 3D Solar Genie 4 World tab */}
          <div className={`min-h-0 flex-1 flex-col overflow-hidden ${side === 'genie' ? 'flex' : 'hidden'}`}>
            <div className="flex items-center justify-between gap-2 border-b border-hub-line p-2 bg-hub-surface">
              <span className="flex items-center gap-1.5 text-xs font-bold text-hub-ink">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Genie 4 Live 3D World</span>
              </span>
              {isHost && (
                <button
                  type="button"
                  onClick={() => setPresentMode((m) => (m === 'genie' ? 'off' : 'genie'))}
                  className="rounded-lg bg-hub-accent px-2.5 py-1 text-xs font-semibold text-hub-accent-ink hover:opacity-90"
                >
                  {presentMode === 'genie' ? 'Stop stage' : 'Project to stage'}
                </button>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              <GenieWorldViewer
                leadName={join.customerName}
                inline
                syncState={isHost ? hostGenieSync : receivedGenieSync}
                onSyncChange={isHost ? setHostGenieSync : undefined}
                onClose={() => setSide('call')}
              />
            </div>
          </div>
          {/* Staff Chat tab */}
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

function ConferencePresentationSync({
  isHost,
  presentMode,
  setPresentMode,
  genieSyncState,
  onGenieSyncReceived,
}: {
  isHost: boolean;
  presentMode: 'off' | 'proposal' | 'genie';
  setPresentMode: (mode: 'off' | 'proposal' | 'genie') => void;
  genieSyncState?: GenieWorldSyncState | null;
  onGenieSyncReceived?: (state: GenieWorldSyncState) => void;
}) {
  const room = useRoomContext();
  const connection = useConnectionState();

  // Host broadcasts presentation mode changes to room participants
  useEffect(() => {
    if (!isHost || connection !== ConnectionState.Connected) return;
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify({ type: 'pg-present', mode: presentMode }));
      void room.localParticipant.publishData(payload, { reliable: true });
    } catch {
      // Ignore broadcast errors
    }
  }, [isHost, connection, presentMode, room]);

  // Host broadcasts Genie 3D camera / weather sync updates
  useEffect(() => {
    if (!isHost || connection !== ConnectionState.Connected || !genieSyncState || presentMode !== 'genie') return;
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify({ type: 'pg-genie-state', state: genieSyncState }));
      void room.localParticipant.publishData(payload, { reliable: false });
    } catch {
      // Ignore broadcast errors
    }
  }, [isHost, connection, genieSyncState, presentMode, room]);

  // Host re-broadcasts when a new participant connects to ensure state synchronization
  useEffect(() => {
    if (!isHost || connection !== ConnectionState.Connected) return;
    const onParticipantConnected = () => {
      if (presentMode !== 'off') {
        try {
          const encoder = new TextEncoder();
          const payload = encoder.encode(JSON.stringify({ type: 'pg-present', mode: presentMode }));
          void room.localParticipant.publishData(payload, { reliable: true });
        } catch {
          // Ignore broadcast errors
        }
      }
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
    };
  }, [isHost, connection, presentMode, room]);

  // Guest listens for presentation mode and Genie 3D sync changes from host
  useEffect(() => {
    const onData = (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data?.type === 'pg-present' && (data.mode === 'off' || data.mode === 'proposal' || data.mode === 'genie')) {
          setPresentMode(data.mode);
        } else if (data?.type === 'pg-genie-state' && data.state && onGenieSyncReceived) {
          onGenieSyncReceived(data.state);
        }
      } catch {
        // Ignore malformed payload
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, setPresentMode, onGenieSyncReceived]);

  return null;
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

function GeniePresentationStage({
  customerName,
  onExit,
  syncState,
  onSyncChange,
  followHost,
  onToggleFollowHost,
}: {
  customerName: string;
  onExit: () => void;
  syncState?: GenieWorldSyncState | null;
  onSyncChange?: (state: GenieWorldSyncState) => void;
  followHost?: boolean;
  onToggleFollowHost?: (following: boolean) => void;
}) {
  return (
    <>
      <section className="pg-presentation-stage relative" aria-label="3D Solar World stage">
        <GenieWorldViewer
          leadName={customerName}
          inline
          syncState={syncState}
          onSyncChange={onSyncChange}
          followHost={followHost}
          onToggleFollowHost={onToggleFollowHost}
          onClose={onExit}
        />
        <PresentationPip />
      </section>
      <VideoConference />
    </>
  );
}

function ProposalPresentationStage({
  proposalUrl,
  customerName,
  onExit,
}: {
  proposalUrl: string;
  customerName: string;
  onExit: () => void;
}) {
  return (
    <>
      <section className="pg-presentation-stage" aria-label="Proposal presentation stage">
        <div className="pg-presentation-header flex items-center justify-between gap-3 border-b border-[#33566b] bg-[#0c2231] px-4 py-2 text-hub-ink">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <strong className="text-sm font-bold text-white">Presenting Proposal</strong>
            <span className="hidden text-xs text-[#a0c2d6] sm:inline">· {customerName}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={proposalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[#33566b] bg-[#122c3e] px-2.5 py-1 text-xs font-semibold text-[#ecfaff] hover:bg-[#183950]"
            >
              <span>Open in tab</span>
              <span aria-hidden="true">↗</span>
            </a>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1 rounded-lg border border-[#33566b] bg-[#122c3e] px-2.5 py-1 text-xs font-semibold text-[#ecfaff] hover:bg-[#183950]"
            >
              <X className="h-3.5 w-3.5" />
              <span>Exit presentation</span>
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          <iframe
            title={`Sunrun Proposal Presentation for ${customerName}`}
            src={proposalUrl}
            className="h-full w-full border-0 bg-white"
          />
          <PresentationPip />
        </div>
      </section>
      <VideoConference />
    </>
  );
}

function PresentationPip() {
  const tracks = useTracks([Track.Source.Camera]);
  const active = tracks.filter((t) => t.publication.isSubscribed && !t.publication.isMuted);
  if (active.length === 0) return null;
  return (
    <div className="pg-presentation-pip absolute bottom-3 right-3 z-30 flex max-w-[320px] flex-col gap-1.5 rounded-xl border border-[#33566b] bg-[#0b202fe6] p-2 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-[#a0c2d6]">
        <span>Live Video</span>
        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {active.slice(0, 3).map((track) => (
          <div key={track.publication.trackSid} className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-black border border-[#33566b]/60">
            <VideoTrack trackRef={track} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GuestConference() {
  const connection = useConnectionState();
  const participants = useRemoteParticipants();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const host = participants.find(participant => participant.identity.startsWith('host-'));
  const camera = tracks.find(track => track.participant === host && track.source === Track.Source.Camera && track.publication.isSubscribed && !track.publication.isMuted);
  const sharing = tracks.some(track => track.source === Track.Source.ScreenShare && !track.publication.isMuted);
  const [gallery, setGallery] = useState(false);
  const showStage = connection === ConnectionState.Connected && !sharing && !gallery;
  return <>
    {!sharing && <button type="button" className="pg-view-switch" onClick={() => setGallery(value => !value)}>{gallery ? 'Show host stage' : 'Show participants'}</button>}
    {showStage && <section className="pg-host-stage" aria-label="Host stage">
      <div className="pg-host-scene">
        {camera && <div className="pg-projection"><VideoTrack trackRef={camera} /></div>}
        <p role="status">{host ? camera ? host.name || 'Host' : (host.name || 'Host') + ' · Camera off or connecting' : 'Waiting for host'}</p>
      </div>
    </section>}
    <VideoConference />
  </>;
}

function plainConnectionNote(message: string): string {
  if (/permission denied|notallowederror/i.test(message)) return 'Device access was denied. Allow microphone access in this site’s browser permissions, then enable the microphone in the call bar.'
  if (/authorization|token|401/i.test(message)) return 'The room could not verify this join. Ask Horace or Rory to let you in again.'
  if (/signal|websocket|network|fetch/i.test(message)) return 'Could not reach the video service. Check your connection, then try again.'
  return message
}

function SideTab({
  current,
  id,
  onSelect,
  children,
}: {
  current: ConferenceSideTab;
  id: ConferenceSideTab;
  onSelect: (id: ConferenceSideTab) => void;
  children: React.ReactNode;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      aria-pressed={on}
      onClick={() => onSelect(id)}
      className={`min-h-11 flex-1 rounded-lg px-2 text-[0.84rem] font-bold transition-colors ${
        on
          ? 'bg-hub-primary text-hub-on-primary shadow-sm'
          : 'text-hub-soft hover:bg-hub-surface hover:text-hub-ink'
      }`}
    >
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
  initialInvitePath = null,
  onClose,
}: {
  customerId: string;
  customerName: string;
  sample: boolean;
  initialInvitePath?: string | null;
  onClose: () => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(sample ? false : null);
  const [problem, setProblem] = useState<ConferenceProblem | null>(null);
  const [invitePath, setInvitePath] = useState<string | null>(initialInvitePath);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
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

  if (wrapUp) return <CallWrapUp customerId={customerId} name={customerName} onClose={onClose} />;
  if (join) return <ConferenceCall join={join} isHost customerId={customerId} startWithCamera={hostCamera} onLeave={() => { setJoin(null); setWrapUp(true); }} />;

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
