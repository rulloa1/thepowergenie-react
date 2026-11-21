import React, { useEffect, useRef, useState } from 'react';
import { Video, VideoOff } from 'lucide-react';
import ConferenceLobby from './ConferenceLobby';
import { ConferenceCall } from '../hub/ConferenceRoom';
import { conferenceApi, ConferenceError, type JoinInfo } from '../hub/conferenceApi';
import { BrandMark, Button, Notice, Spinner, inputClass, labelClass } from '../hub/ui';

export default function ConferenceJoinPage({ token }: { token: string | null }) {
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [camera, setCamera] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [join, setJoin] = useState<JoinInfo | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
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
    if (!token || !guestId || join || denied || leaving) return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const result = await conferenceApi.guest(token, guestId);
        if (!alive) return;
        setStatusError(null);
        if (result.status === 'admitted') {
          if (typeof result.startWithCamera === 'boolean') setCamera(result.startWithCamera);
          setJoin(result);
          return;
        }
        if (result.status === 'denied') {
          setDenied(true);
          return;
        }
      } catch {
        if (!alive) return;
        setStatusError('Trying to reconnect. Keep this page open.');
      }
      timer = window.setTimeout(() => void tick(), 2500);
    };
    void tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [token, guestId, join, denied, leaving]);

  const knock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (camera === null) {
      setError('Choose whether to use your camera.');
      return;
    }
    setError(null);
    try {
      const result = await conferenceApi.knock(token, name, camera);
      setGuestId(result.guestId);
    } catch (reason) {
      setError(reason instanceof ConferenceError ? reason.message : 'Could not join the waiting room.');
    }
  };

  if (join) {
    return (
      <ConferenceCall
        join={join}
        isHost={false}
        startWithCamera={camera === true}
        onLeave={() => { setJoin(null); setGuestId(null); }}
      />
    );
  }

  if (guestId && !denied && token) {
    return (
      <ConferenceLobby statusError={statusError} leaving={leaving} onLeave={() => {
        setLeaving(true);
        void conferenceApi.withdraw(token, guestId).then(() => {
          setGuestId(null);
          setError(null);
          setStatusError(null);
        }).catch(() => {
          setStatusError('Could not leave the queue. Please try again.');
        }).finally(() => setLeaving(false));
      }}>
        {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
        <CameraChoice
          camera={camera}
          onChange={(next) => {
            setCamera(next);
            setError(null);
            void conferenceApi.setCamera(token, guestId, next).catch((reason: Error) => setError(reason.message));
          }}
        />
      </ConferenceLobby>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F4F6FA] font-[family:var(--sw-font-body)] lg:flex-row">
      <aside className="relative isolate flex shrink-0 flex-col overflow-hidden bg-[#0B2233] px-6 py-5 text-white shadow-[inset_0_-3px_0_#FF6B00] sm:px-10 lg:w-[46%] lg:px-14 lg:py-12 lg:shadow-[inset_-3px_0_0_#FF6B00]">
        <img src="/assets/stills/06-cta.webp" alt="" aria-hidden="true" className="absolute inset-0 -z-10 hidden h-full w-full object-cover opacity-40 lg:block" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 hidden bg-gradient-to-t from-[#0B2233] via-[#0B2233]/80 to-[#0B2233]/55 lg:block" />
        <a href="/" className="flex items-center gap-3 rounded-xl text-white no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A3412] focus-visible:ring-offset-2" title="The Power Genie home">
          <img src="/assets/brand/power-genie-icon.png" alt="" className="h-10 w-10 rounded-xl bg-white/10 object-cover lg:h-12 lg:w-12" />
          <span className="leading-tight">
            <span className="block text-base font-bold lg:text-lg">The Power Genie</span>
            <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#FF8A2B]">Conference room</span>
          </span>
        </a>
        <div className="mt-5 max-w-md lg:mt-auto lg:max-w-lg lg:pt-16">
          <h2 className="m-0 hidden text-[clamp(2.25rem,3.6vw,3.4rem)] font-bold leading-[1.05] tracking-tight text-balance lg:block">
            The same call. <span className="text-[#FF8A2B]">Your camera, your choice.</span>
          </h2>
          <p className="m-0 max-w-md text-[0.98rem] leading-relaxed text-[#D9E6F2] lg:mt-5 lg:text-[1.02rem]">
            Horace or Rory will let you in. You do not need an account.
          </p>
        </div>
        <p className="mt-auto hidden pt-12 text-[0.8rem] text-[#8EAEC7] lg:block">The Power Genie by Sunrun · Houston</p>
      </aside>
      <main className="book-page flex flex-1 items-start justify-center px-5 py-10 sm:items-center sm:px-8 lg:py-12">
      <div className="w-full max-w-[440px]">
        <BrandMark className="mb-8 hidden h-auto w-60 rounded-2xl bg-[#0B2233] px-5 py-3 shadow-[inset_0_-3px_0_#FF6B00,0_10px_30px_rgba(11,34,51,0.18)] lg:block" />
        <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[#FF6B00]">The Power Genie</p>
        <h1 className="m-0 mt-2 text-[2rem] font-bold leading-tight tracking-tight text-[#1A1A2E]">Join the call</h1>
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
            <CameraChoice camera={camera} onChange={setCamera} />
            <Button type="submit" variant="accent" className="w-full" disabled={camera === null}>
              {camera === false ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              {camera === false ? 'Ask to join without video' : 'Ask to join'}
            </Button>
          </form>
        )}
        {denied && <div className="mt-5"><Notice tone="warn">The host did not let you in this time. Ask them for a new link if the call is still on.</Notice></div>}
      </div>
      </main>
    </div>
  );
}

function CameraChoice({ camera, onChange }: { camera: boolean | null; onChange: (next: boolean) => void }) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className={labelClass}>Camera</legend>
      <CameraOption
        selected={camera === true}
        label="Use my camera"
        detail="Horace and Rory can see you. You can turn it off during the call."
        icon={<Video className="h-4 w-4" />}
      >
        <input type="radio" name="guest-camera" value="on" required checked={camera === true} onChange={() => onChange(true)} className="mt-1 h-4 w-4 accent-[#FF6B00]" />
      </CameraOption>
      {camera === true && <CameraPreview />}
      <CameraOption
        selected={camera === false}
        label="Join without video"
        detail="They can hear you. Your camera stays off until you turn it on."
        icon={<VideoOff className="h-4 w-4" />}
      >
        <input type="radio" name="guest-camera" value="off" required checked={camera === false} onChange={() => onChange(false)} className="mt-1 h-4 w-4 accent-[#FF6B00]" />
      </CameraOption>
    </fieldset>
  );
}

function CameraOption({
  selected,
  label,
  detail,
  icon,
  children,
}: {
  selected: boolean;
  label: string;
  detail: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-hub-focus ${selected ? 'border-hub-accent-line bg-hub-accent-soft' : 'border-hub-line bg-hub-muted'}`}>
      {children}
      <span>
        <span className="flex items-center gap-1.5 font-bold">{icon} {label}</span>
        <span className="mt-0.5 block text-[0.84rem] leading-snug text-hub-soft">{detail}</span>
      </span>
    </label>
  );
}

function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const devices = navigator.mediaDevices;
    if (!devices?.getUserMedia) {
      setProblem('This browser did not open the camera. You can still join without video.');
      return;
    }
    devices.getUserMedia({ video: true, audio: false }).then((next) => {
      if (cancelled) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = next;
      if (videoRef.current) {
        videoRef.current.srcObject = next;
        void videoRef.current.play();
      }
    }).catch(() => {
      if (!cancelled) setProblem('This browser did not open the camera. You can still join without video.');
    });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div>
      <video ref={videoRef} muted playsInline autoPlay aria-label="Camera preview" className="aspect-video w-full rounded-xl bg-black object-cover" />
      <p className="m-0 mt-1 text-[0.8rem] text-hub-soft">{problem || 'This preview is only on your phone or computer. Nobody else sees it yet.'}</p>
    </div>
  );
}
