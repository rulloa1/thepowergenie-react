import { useEffect, useRef, useState } from 'react';

/**
 * The Power Genie opens the website: the genie rises out of a swirl, the
 * sun's rays sweep in, the bolt strikes, the name appears, and the screen
 * opens from the center onto the homepage.
 *
 * Plays once per visitor (stored in the browser), never with reduced motion,
 * never when the link points somewhere on the page (#bill, #quote), and any
 * tap, scroll or key skips it. ?intro=1 forces it for a preview.
 */

const STORAGE_KEY = 'pg-intro-v1';
const LAYERS = [
  '/assets/brand/intro/genie-genie.webp',
  '/assets/brand/intro/genie-sun.webp',
  '/assets/brand/intro/genie-bolt.webp',
  '/assets/brand/intro/wordmark.webp',
];
/** Time from the first frame to the start of the opening, and the opening itself. */
const HOLD_MS = 2000;
const OPEN_MS = 620;

function shouldPlay(): boolean {
  if (typeof window === 'undefined') return false;
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return false;
  }
  if (url.searchParams.get('intro') === '1') return true;
  if (url.hash && url.hash !== '#' && url.hash !== '#top') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return false;
  } catch {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY)) return false;
    } catch {
      /* No storage: play it; it is short and skippable. */
    }
  }
  return true;
}

function remember(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* Nothing to do. */
    }
  }
}

function decode(src: string): Promise<void> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().catch(() => undefined);
}

type Phase = 'off' | 'wait' | 'play' | 'open';

export default function IntroAnimation() {
  const [phase, setPhase] = useState<Phase>(() => (shouldPlay() ? 'wait' : 'off'));
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Start once the artwork is decoded so nothing pops in half-drawn.
  // If it takes too long, skip the intro rather than keep the site covered.
  useEffect(() => {
    if (phase !== 'wait') return;
    remember();
    let done = false;
    const giveUp = window.setTimeout(() => {
      if (!done) setPhase('off');
      done = true;
    }, 1500);
    Promise.all(LAYERS.map(decode)).then(() => {
      if (done) return;
      done = true;
      window.clearTimeout(giveUp);
      setPhase('play');
    });
    return () => window.clearTimeout(giveUp);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play') return;
    const timer = window.setTimeout(() => setPhase('open'), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'open') return;
    const timer = window.setTimeout(() => setPhase('off'), OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Any sign the visitor wants the site skips straight to the opening.
  useEffect(() => {
    if (phase === 'off') return;
    const skip = () => {
      if (phaseRef.current === 'wait') setPhase('off');
      else if (phaseRef.current === 'play') setPhase('open');
    };
    const events: Array<keyof WindowEventMap> = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    events.forEach((name) => window.addEventListener(name, skip, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, skip));
  }, [phase === 'off']); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'off') return null;

  return (
    <div
      className={`pg-intro${phase === 'play' || phase === 'open' ? ' is-playing' : ''}${phase === 'open' ? ' is-opening' : ''}`}
      role="img"
      aria-label="The Power Genie"
      data-testid="intro"
    >
      <div className="pg-intro__stars" aria-hidden="true" />
      <div className="pg-intro__center" aria-hidden="true">
        <div className="pg-intro__mark">
          <span className="pg-intro__glow" />
          <span className="pg-intro__smoke pg-intro__smoke--a" />
          <span className="pg-intro__smoke pg-intro__smoke--b" />
          <span className="pg-intro__smoke pg-intro__smoke--c" />
          <img className="pg-intro__layer pg-intro__genie" src={LAYERS[0]} alt="" draggable={false} />
          <img className="pg-intro__layer pg-intro__sun" src={LAYERS[1]} alt="" draggable={false} />
          <img className="pg-intro__layer pg-intro__bolt" src={LAYERS[2]} alt="" draggable={false} />
          <span className="pg-intro__flash" />
        </div>
        <img className="pg-intro__word" src={LAYERS[3]} alt="" draggable={false} />
        <span className="pg-intro__rule" />
      </div>
      <button type="button" className="pg-intro__skip" onClick={() => setPhase(phase === 'wait' ? 'off' : 'open')}>
        Skip
      </button>
    </div>
  );
}
