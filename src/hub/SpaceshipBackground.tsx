import { useEffect, useRef, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { LocalVideoTrack } from 'livekit-client';

export default function SpaceshipBackground({ host, onProblem }: { host: boolean; onProblem: (message: string) => void }) {
  const { cameraTrack, isCameraEnabled, localParticipant } = useLocalParticipant();
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState('Turn on your camera for the hologram effect.');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const track = cameraTrack?.track;
  useEffect(() => {
    if (!host || !enabled || !isCameraEnabled || !(track instanceof LocalVideoTrack)) return;
    let cancelled = false;
    let owned = false;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (cancelled) return;
      setStatus('Preparing hologram effect…');
      try {
        const { BackgroundProcessor, supportsBackgroundProcessors } = await import('@livekit/track-processors');
        if (cancelled) return;
        if (!supportsBackgroundProcessors()) throw new Error('unsupported');
        const processor = BackgroundProcessor({ mode: 'virtual-background', imagePath: new URL('/assets/conference/projection-matte.png', window.location.origin).href });
        owned = true;
        await track.setProcessor(processor);
        if (!cancelled) setStatus('Hologram effect active');
      } catch {
        if (owned) { await track.stopProcessor().catch(() => {}); owned = false; }
        if (!cancelled) {
          await localParticipant.setCameraEnabled(false).catch(() => {});
          setStatus('Hologram unavailable on this device.');
          onProblem('The hologram effect could not start, so your camera was turned off. Try a supported browser, or switch Hologram off before turning your camera on to show your real surroundings.');
        }
      }
    });
    return () => {
      cancelled = true;
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (owned) { await track.stopProcessor().catch(() => {}); owned = false; }
      });
    };
  }, [host, enabled, isCameraEnabled, track, localParticipant, onProblem]);
  if (!host) return null;
  return <div className="pg-spaceship-control">
    <button type="button" aria-pressed={enabled} onClick={() => setEnabled(value => !value)}>✦ Hologram {enabled ? 'on' : 'off'}</button>
    <span role="status">{!enabled ? 'Your real surroundings will be visible on camera.' : isCameraEnabled ? status : 'Camera off · hologram ready when supported'}</span>
  </div>;
}
