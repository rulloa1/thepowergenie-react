import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Config, Segment } from '../types';
import { openAssistant } from '../lib/openAssistant';
import { lockPageScroll } from '../lib/scrollLock';
import { preservedScrollTop } from '../lib/scrollPosition';
import { shouldHandleClientNavigation } from '../lib/siteRoutes';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Show the scrub video once it has presented a decoded frame, and keep it framed. */
function syncFrame(s: Segment) {
  const video = s.video;
  if (!video) return;
  if ((video.readyState >= 2 && video.videoWidth > 0) || s.sawFrame) {
    s.sawFrame = true;
    s.frameVisible = true;
    s.el?.classList.add('is-framed');
  }
}

function watchPresentedFrame(s: Segment) {
  const video = s.video;
  if (!video) return;
  const mark = () => {
    if (video.readyState >= 2 && video.videoWidth > 0) {
      s.sawFrame = true;
      syncFrame(s);
    }
  };
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(() => mark());
  } else {
    requestAnimationFrame(() => requestAnimationFrame(mark));
  }
}

function clipUrl(s: Segment, isMobile: boolean) {
  if (isMobile && s.clipM) return s.clipM;
  return s.clip || null;
}

function smoothstep(x: number) {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}

/** Pale accents (Home is #FFF8F0) disappear on the light bar and the copy scrim. */
function accentInk(accent?: string): string {
  if (!accent) return '#1A1A2E';
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(accent.trim());
  if (!match) return accent;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = linear(channel(0));
  const g = linear(channel(2));
  const b = linear(channel(4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? '#1A1A2E' : accent;
}

/**
 * Image blends stay short, and the window is always narrower than half the
 * shortest segment so a third scene cannot enter the mix in either direction.
 */
function imageFadePx(vh: number, minSpan: number, configured?: number) {
  const requested = Math.max(1, (configured ?? 0.16) * vh);
  const blend = Math.max(1, vh * 0.12);
  const adjacentOnly = minSpan > 0 ? minSpan * 0.42 : blend;
  return Math.min(requested, blend, adjacentOnly);
}

/**
 * Copy swaps near the middle of the connector between two sections: the
 * outgoing line stays fully readable through the first quarter of the
 * transition, fades over the next fifth, and the incoming line fades in
 * just after the midpoint. The blank moment is about 6% of a connector.
 */
export function sequentialCopyOpacity(
  y: number,
  segStart: number,
  segEnd: number,
  prevEnd: number | null,
  nextStart: number | null,
) {
  let fadeIn = 1;
  let fadeOut = 1;
  if (prevEnd != null) {
    const conn = Math.max(1, segStart - prevEnd);
    const mid = prevEnd + conn / 2;
    fadeIn = smoothstep((y - (mid + conn * 0.03)) / (conn * 0.22));
  }
  if (nextStart != null) {
    const conn = Math.max(1, nextStart - segEnd);
    const mid = segEnd + conn / 2;
    fadeOut = 1 - smoothstep((y - (mid - conn * 0.03 - conn * 0.22)) / (conn * 0.22));
  }
  return fadeIn * fadeOut;
}

type StageSpan = { start?: number; end?: number; empty?: boolean };

/**
 * How visible each scene is at scroll position y. A transition with no clip
 * for this device is never shown: the scene before it holds its last frame and
 * the next scene dissolves in over it across the transition's whole scroll,
 * so the picture keeps changing instead of parking on a still.
 */
export function stageOpacity(y: number, i: number, segs: StageSpan[], imageFade: number): number {
  const s = segs[i];
  if (!s || s.empty) return 0;
  const last = segs.length - 1;
  const prev = i > 0 ? segs[i - 1] : null;
  const next = i < last ? segs[i + 1] : null;
  const start = s.start || 0;
  const end = s.end || 0;
  let fadeIn = 1;
  if (prev?.empty) {
    const a = prev.start || 0;
    fadeIn = smoothstep((y - a) / Math.max(1, (prev.end || 0) - a));
  } else if (prev) {
    fadeIn = smoothstep((y - start + imageFade) / (2 * imageFade));
  }
  let fadeOut = 1;
  if (next?.empty) {
    // Covered by the next scene by the time it is fully in.
    fadeOut = y < (next.end || 0) ? 1 : 0;
  } else if (next) {
    fadeOut = 1 - smoothstep((y - (end - imageFade)) / (2 * imageFade));
  }
  return fadeIn * fadeOut;
}

/** Screens of scroll for a dissolve between two scenes with no transition clip. */
const DISSOLVE_SCROLL = 0.75;

interface ScrollWorldProps {
  config: Config;
  onQuoteClick?: () => void;
  onNavigateBrands?: () => void;
}

const navLinkClass = 'sw-nav__item whitespace-nowrap font-inherit text-[0.82rem] no-underline border-0 bg-transparent cursor-pointer px-3.5 py-1.5 rounded-full transition-all duration-200 text-[var(--sw-ink-soft)] hover:text-[var(--sw-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)]';

function followBrands(
  event: React.MouseEvent<HTMLAnchorElement>,
  onNavigateBrands?: () => void,
) {
  if (!onNavigateBrands || !shouldHandleClientNavigation(event)) return;
  event.preventDefault();
  onNavigateBrands();
  const details = event.currentTarget.closest('details');
  if (details) details.open = false;
}

export default function ScrollWorld({ config, onQuoteClick, onNavigateBrands }: ScrollWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copylayerRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollbarFillRef = useRef<HTMLSpanElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [readingMode, setReadingMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  
  const stateRef = useRef({
    totalW: 0,
    vh: 0,
    laidOutW: 0,
    stageX: 0,
    ticking: false,
    framePending: false,
    jumpTarget: -1,
    jumpTimer: 0,
    userReady: false,
    idleActive: config.idle !== false,
    idleStart: performance.now(),
  });

  const segmentsRef = useRef<Segment[]>([]);
  /** Clips download a few at a time, nearest to the visitor first. */
  const loaderRef = useRef({ active: 0, current: 0 });
  const pumpRef = useRef<() => void>(() => {});
  const accentIndexRef = useRef(-1);

  // Helpers
  const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lingerEase = (x: number, L: number) => { 
    L = clamp(L); 
    const c = x - 0.5; 
    return (1 - L) * x + L * (4 * c * c * c + 0.5); 
  };
  const pad = (n: number) => String(n).padStart(2, '0');

  const updateActiveIndex = useCallback((index: number) => {
    setActiveIndex(index);
    // Setting the same custom property every frame restyles the whole page.
    if (accentIndexRef.current === index) return;
    accentIndexRef.current = index;
    const accent = config.sections[index]?.accent || '';
    if (containerRef.current) {
      containerRef.current.style.setProperty('--sw-accent', accent);
      containerRef.current.style.setProperty('--sw-accent-ink', accentInk(accent));
    }
  }, [config.sections]);

  const primeVideo = useCallback((v: HTMLVideoElement | null | undefined) => {
    if (!isMobile || !v) return;
    try {
      const p = v.play();
      if (p && p.then) {
        p.then(() => {
          try { v.pause(); wake(); } catch (e) {}
        }).catch(wake);
      }
    } catch (e) {}
  }, [isMobile]);

  const wake = useCallback(() => {
    if (!readingMode && !document.hidden && !stateRef.current.framePending) {
      stateRef.current.framePending = true;
      requestAnimationFrame(raf);
    }
  }, [readingMode]);

  const raf = useCallback(() => {
    stateRef.current.framePending = false;
    if (document.hidden) return;
    
    let moving = false;
    const eps = isMobile ? 0.02 : 0.008;
    
    segmentsRef.current.forEach((s, i) => {
      if (s.video) syncFrame(s);
      if (!s.ready || !s.video || !s.visible) return;
      
      const lerp = isMobile ? 0.45 : 0.35;
      s.cur = (s.cur || 0) + ((s.target || 0) - (s.cur || 0)) * lerp;
      
      if (Math.abs((s.cur || 0) - (s.target || 0)) > 0.001) moving = true;

      if (s.video.seeking || s.video.readyState < 2) {
        moving = true;
        return;
      }

      const dur = s.video.duration || 1;
      const t = clamp(s.cur, 0, 0.999) * dur;
      
      if (Math.abs(s.video.currentTime - t) > eps) {
        try { s.video.currentTime = t; } catch (e) {}
      }
    });
    
    if (moving) wake();
  }, [isMobile, wake]);

  const loadClip = useCallback((s: Segment, preload: 'auto' | 'metadata' = 'metadata'): boolean => {
    if (readingMode || s.failed || !s.el) return false;
    const url = clipUrl(s, isMobile);
    if (!url) return false;

    if (s.video) {
      if (s.preloadMode !== preload) {
        const previous = s.preloadMode;
        s.preloadMode = preload;
        s.video.preload = preload;
        s.video.setAttribute('preload', preload);
        if (preload === 'auto' && previous !== 'auto' && s.video.readyState < 2) {
          try { s.video.load(); } catch (e) {}
        }
      }
      return false;
    }
    if (s.loading) return false;
    s.loading = true;
    s.preloadMode = preload;

    const v = document.createElement('video');
    v.className = 'sw-scene__video absolute inset-0 z-[1] w-full h-full object-cover object-[center_42%]';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.preload = preload;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('preload', preload);
    v.disablePictureInPicture = true;

    v.addEventListener('loadedmetadata', () => {
      s.ready = Number.isFinite(v.duration) && v.duration > 0;
      requestRead();
    });

    const onFrameMaybe = () => {
      watchPresentedFrame(s);
      syncFrame(s);
      wake();
    };

    v.addEventListener('seeked', onFrameMaybe);
    v.addEventListener('loadeddata', () => {
      if (stateRef.current.userReady) primeVideo(v);
      onFrameMaybe();
    });

    v.addEventListener('canplay', () => {
      onFrameMaybe();
      wake();
    });
    v.addEventListener('progress', wake);
    v.addEventListener('error', () => {
      s.failed = true;
      s.ready = false;
      s.sawFrame = false;
      s.frameVisible = false;
      s.loading = false;
      s.video = null;
      s.el?.classList.remove('is-framed');
      v.remove();
      requestRead();
    });

    s.el.appendChild(v);
    s.video = v;

    // Use blob URL where available for instant keyframe scrubbing, with fallback to direct url
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((blob) => {
        if (!v.isConnected) return;
        const blobUrl = URL.createObjectURL(blob);
        (s as any).blobUrl = blobUrl;
        v.src = blobUrl;
      })
      .catch(() => {
        if (v.isConnected) {
          v.src = url;
        }
      })
      .finally(() => {
        loaderRef.current.active = Math.max(0, loaderRef.current.active - 1);
        pumpRef.current();
      });
    return true;
  }, [readingMode, isMobile, primeVideo, wake]);

  // Downloading every clip at once left the section in view on a still
  // image for seconds on a phone. Two downloads at a time (three on a
  // computer), the section in view first, then the ones just ahead.
  pumpRef.current = () => {
    const loader = loaderRef.current;
    const segs = segmentsRef.current;
    // While the clip in view is still downloading it gets the whole connection.
    const limit = () => {
      const inView = segs[loader.current];
      return inView?.loading && inView.video && !inView.video.src ? 1 : isMobile ? 2 : 3;
    };
    while (loader.active < limit()) {
      let best: Segment | null = null;
      let bestScore = Infinity;
      segs.forEach((seg, index) => {
        if (seg.video || seg.loading || seg.failed || !seg.el || !clipUrl(seg, isMobile)) return;
        const distance = index - loader.current;
        const score = distance >= 0 ? distance : 0.5 - distance * 1.5;
        if (score < bestScore) {
          bestScore = score;
          best = seg;
        }
      });
      if (!best || !loadClip(best, 'auto')) break;
      loader.active += 1;
    }
  };

  const read = useCallback(() => {
    const rawY = window.scrollY || 0;
    const totalW = stateRef.current.totalW;
    const vh = stateRef.current.vh;
    const y = readingMode ? rawY : clamp(rawY, 0, totalW * vh);
    
    if (readingMode) {
      if (scrollbarFillRef.current) {
        const progress = clamp(y / Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
        scrollbarFillRef.current.style.transform = `scaleX(${progress})`;
      }
      stateRef.current.ticking = false;
      return;
    }

    const spans = segmentsRef.current
      .map((s) => Math.max(0, (s.end || 0) - (s.start || 0)))
      .filter((span) => span > 0);
    const minSpan = spans.length ? Math.min(...spans) : vh;
    const imageFade = imageFadePx(vh, minSpan, config.crossfade);
    let current = 0;
    segmentsRef.current.forEach((s, i) => {
      if (y >= (s.start || 0)) current = i;
    });

    if (loaderRef.current.current !== current) {
      loaderRef.current.current = current;
      pumpRef.current();
    }

    // How far the quote panel has slid up over the last scene, in px.
    const exitPx = Math.max(0, rawY - totalW * vh);
    const exitFade = 1 - smoothstep(exitPx / ((isMobile ? 0.16 : 0.3) * vh));

    // Position-based, so scrolling back uses the same blend as scrolling down.
    const spansForFade: StageSpan[] = segmentsRef.current.map((s) => ({
      start: s.start,
      end: s.end,
      empty: s.kind === 'conn' && !clipUrl(s, isMobile),
    }));

    segmentsRef.current.forEach((s, i) => {
      const span = Math.max(1, (s.end || 0) - (s.start || 0));
      const local = clamp((y - (s.start || 0)) / span, 0, 1);
      s.target = s.linger ? lingerEase(local, s.linger) : local;

      const op = stageOpacity(y, i, spansForFade, imageFade);
      const inRange = op > 0.001;

      if (s.el) {
        s.el.style.opacity = inRange ? String(op) : '0';
        s.el.style.visibility = inRange ? 'visible' : 'hidden';
        s.el.style.zIndex = String(i + 1);
      }
      s.visible = inRange;
      
      if (!s.frameVisible && s.img) {
        // A slow, slight push-in while the clip loads. It stays close to the
        // video's own framing so nothing jumps when the video takes over.
        const sc = 1 + local * 0.03;
        s.img.style.transform = `scale(${sc.toFixed(3)})`;
      }
    });

    // Copy layer
    const copies = copylayerRef.current?.querySelectorAll('.sw-copy');
    if (copies) {
      config.sections.forEach((s, i) => {
        const seg = segmentsRef.current.find(seg => seg.kind === 'dive' && seg.si === i);
        if (!seg) return;
        
        const pr = clamp((y - (seg.start || 0)) / Math.max(1, (seg.end || 0) - (seg.start || 0)), 0, 1);
        const previous = i > 0 ? config.sections[i - 1]._seg : null;
        const next = i < config.sections.length - 1 ? config.sections[i + 1]._seg : null;
        // The last line fades as the quote panel arrives instead of sitting under it.
        const cop = sequentialCopyOpacity(
          y,
          seg.start || 0,
          seg.end || 0,
          previous ? (previous.end ?? null) : null,
          next ? (next.start ?? null) : null,
        ) * exitFade;

        const c = copies[i] as HTMLElement;
        if (c) {
          c.style.opacity = String(cop);
          c.style.visibility = cop > 0.001 ? 'visible' : 'hidden';
          const ty = (0.5 - pr) * (isMobile ? 2 : 4);
          c.style.transform = `translateY(${ty}vh)`;
          c.style.pointerEvents = cop > 0.5 ? 'auto' : 'none';
          c.setAttribute('aria-hidden', String(cop <= 0.5));
        }

      });
    }

    const cur = segmentsRef.current[current];
    const near = clamp(cur?.kind === 'dive' ? cur.si : (((y - (cur?.start || 0)) / ((cur?.end || 0) - (cur?.start || 0))) > 0.5 ? (cur?.si || 0) + 1 : (cur?.si || 0)), 0, config.sections.length - 1);
    
    if (stateRef.current.jumpTarget < 0) {
      updateActiveIndex(near);
    }

    if (scrollbarFillRef.current) {
      scrollbarFillRef.current.style.transform = `scaleX(${clamp(y / (totalW * vh))})`;
    }
    
    if (hintRef.current) {
      hintRef.current.style.opacity = String(clamp(1 - y / (0.5 * vh)));
    }
    
    if (particlesRef.current) {
      particlesRef.current.style.transform = `translate3d(0, ${-y * 0.05}px, 0)`;
    }

    stateRef.current.ticking = false;
    wake();
  }, [readingMode, isMobile, config.sections, config.crossfade, updateActiveIndex, wake]);

  const requestRead = useCallback(() => {
    if (!stateRef.current.ticking) {
      stateRef.current.ticking = true;
      requestAnimationFrame(read);
    }
  }, [read]);

  const layout = useCallback((preservePosition = false) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const small = window.matchMedia('(max-width: 860px)').matches;
    
    const isNowMobile = coarse || small;
    setIsMobile(isNowMobile);
    
    const isNowReading = reduce || (navigator as any).connection?.saveData;
    setReadingMode(!!isNowReading);

    const vh = window.innerHeight;
    // A transient 0-height viewport (toolbar animation) would collapse the track.
    if (vh < 200) {
      requestRead();
      return;
    }
    const prevVh = stateRef.current.vh || vh;
    const prevTotal = stateRef.current.totalW;

    stateRef.current.vh = vh;
    stateRef.current.laidOutW = window.innerWidth;
    stateRef.current.stageX = window.innerWidth > 860 ? 4 : 0;
    
    if (isNowReading) {
      requestRead();
      return;
    }

    let off = 0;
    segmentsRef.current.forEach(s => {
      s.start = off * vh;
      off += s.w;
      s.end = off * vh;
    });
    stateRef.current.totalW = off;
    
    if (trackRef.current) {
      trackRef.current.style.height = (off * vh + vh) + 'px';
    }
    
    if (preservePosition && prevTotal > 0) {
      const nextTop = preservedScrollTop(window.scrollY, prevTotal * prevVh, off * vh);
      // scrollTo during a fling cancels momentum and can leave a pale frame
      // with the fixed bar away from the visual top. Skip no-ops.
      if (Math.abs(nextTop - window.scrollY) > 1) {
        window.scrollTo({ top: nextTop, behavior: 'instant' as ScrollBehavior });
      }
    }
    
    requestRead();
  }, [requestRead]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const consultFromHash = useRef(false);

  // Headlines live in a fixed layer, so a native hash jump cannot find their
  // place in the scrub track. #quote is below that track and only has a real
  // document position after layout().
  const applyLocationHash = useCallback(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash === 'consult' || hash === 'bill') {
      if (consultFromHash.current) return;
      consultFromHash.current = true;
      openAssistant(hash === 'bill' ? 'bill' : 'book');
      return;
    }
    consultFromHash.current = false;
    if (hash === 'quote') {
      document.getElementById('quote')?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      return;
    }
    const index = hash === 'top' ? 0 : config.sections.findIndex((section) => section.id === hash);
    if (index < 0) return;
    const seg = segmentsRef.current.find((s) => s.kind === 'dive' && s.si === index);
    if (!seg || seg.start == null || seg.end == null) return;
    const top = index === 0 ? 0 : seg.start + (seg.end - seg.start) * 0.5;
    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
  }, [config.sections]);

  const jumpTo = useCallback((i: number) => {
    if (readingMode) {
      const copies = copylayerRef.current?.querySelectorAll('.sw-copy');
      if (copies && copies[i]) {
        copies[i].scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (!isMobile && (window.innerHeight !== stateRef.current.vh || window.innerWidth !== stateRef.current.laidOutW)) {
      layout();
    }

    const seg = segmentsRef.current.find(s => s.kind === 'dive' && s.si === i);
    if (!seg) return;

    const top = i === 0 ? 0 : (seg.start || 0) + ((seg.end || 0) - (seg.start || 0)) * 0.5;
    
    // Jumping from the menu: fetch the destination's clip next.
    loaderRef.current.current = segmentsRef.current.indexOf(seg);
    pumpRef.current();
    updateActiveIndex(i);
    
    stateRef.current.jumpTarget = i;
    clearTimeout(stateRef.current.jumpTimer);
    stateRef.current.jumpTimer = window.setTimeout(() => {
      stateRef.current.jumpTarget = -1;
      requestRead();
    }, 1600);
    
    window.scrollTo({ top, behavior: 'smooth' });
  }, [readingMode, isMobile, config.sections, layout, updateActiveIndex, requestRead]);

  const onClick = useCallback((event: React.MouseEvent) => {
    const link = (event.target as HTMLElement).closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href')?.slice(1);
    if (!id) return;
    const index = id === 'top' ? 0 : config.sections.findIndex(section => section.id === id);
    if (index >= 0) { 
      event.preventDefault(); 
      jumpTo(index); 
    } else if (id === 'quote') {
      event.preventDefault();
      onQuoteClick?.();
      document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth' });
    } else if (id === 'consult') {
      event.preventDefault();
      openAssistant('book');
    } else if (id === 'bill') {
      event.preventDefault();
      openAssistant('bill');
    }
  }, [config.sections, jumpTo, onQuoteClick]);

  // Initial build of segments
  useEffect(() => {
    const newSegments: Segment[] = [];
    config.sections.forEach((s, i) => {
      const dive: Segment = {
        kind: 'dive',
        si: i,
        clip: s.clip,
        clipM: s.clipMobile || null,
        still: s.still,
        stillM: s.stillMobile || null,
        accent: s.accent,
        w: s.scroll || (config.diveScroll ?? 1.3),
        linger: s.linger || 0,
        cur: 0,
        target: 0
      };
      newSegments.push(dive);
      s._seg = dive;

      if (i < config.sections.length - 1) {
        const next = config.sections[i + 1];
        const clip = config.connectors?.[i] || null;
        const clipM = config.connectorsMobile?.[i] || null;
        // Without a transition clip the two scenes dissolve into each other
        // over a shorter stretch of scroll (see stageOpacity).
        newSegments.push({
          kind: 'conn',
          si: i,
          clip,
          clipM,
          still: s.still,
          stillM: s.stillMobile || null,
          accent: next.accent,
          w: clip || clipM ? (config.connScroll ?? 1.1) : DISSOLVE_SCROLL,
          cur: 0,
          target: 0,
          linger: 0
        });
      }
    });
    setSegments(newSegments);
    segmentsRef.current = newSegments;
    layoutRef.current();
    // The track is empty on the first paint, so the browser's own hash scroll
    // either misses #quote or lands on a fixed headline instead of its scene.
    // Apply it once the track height exists. Instant, so it doesn't fight a
    // wheel the visitor starts during a long smooth glide.
    let userMoved = false;
    const noteUser = () => { userMoved = true; };
    const applyIfIdle = () => { if (!userMoved) applyLocationHash(); };
    applyIfIdle();
    const hashFrame = requestAnimationFrame(applyIfIdle);
    // A late native hash scroll can run after images load and pull a fixed
    // headline back to the top. Re-apply unless the visitor already scrolled.
    const hashTimer = window.setTimeout(applyIfIdle, 350);
    const onHashChange = () => applyLocationHash();
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('wheel', noteUser, { passive: true, once: true });
    window.addEventListener('touchstart', noteUser, { passive: true, once: true });
    window.addEventListener('keydown', noteUser, { once: true });
    return () => {
      cancelAnimationFrame(hashFrame);
      window.clearTimeout(hashTimer);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('wheel', noteUser);
      window.removeEventListener('touchstart', noteUser);
      window.removeEventListener('keydown', noteUser);
      newSegments.forEach((s) => {
        s.video?.remove();
        s.video = null;
        s.el?.classList.remove('is-framed');
      });
    };
    // layout is read through a ref so a parent re-render or an isMobile
    // update cannot rebuild every segment and flash an empty (opacity 0) stage.
  }, [config.sections, config.connectors, config.connectorsMobile, config.diveScroll, config.connScroll]);

  useLayoutEffect(() => {
    segmentsRef.current.forEach((s) => {
      s.el?.classList.toggle('is-framed', !!s.frameVisible);
    });
  });

  useEffect(() => {
    // Clips still end up as in-memory Blobs for smooth scrubbing, but they
    // arrive in order instead of all competing at once.
    pumpRef.current();
  }, [segments, loadClip]);

  // Event listeners
  useEffect(() => {
    const onScroll = () => requestRead();
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (h < 200) return;
      const widthChanged = w !== stateRef.current.laidOutW;
      const heightDelta = Math.abs(h - (stateRef.current.vh || h));
      if (!widthChanged) {
        // Mobile browser chrome changes height on every fling. Rebuilding the
        // track mid-scroll clamps scrollY and shows the pale page background.
        if (w <= 860) return;
        if (heightDelta < 80) return;
      }
      layout(true);
    };
    const onFirstGesture = () => {
      if (stateRef.current.userReady) return;
      stateRef.current.userReady = true;
      segmentsRef.current.forEach(s => primeVideo(s.video));
    };
    
    const onScrollEnd = () => {
      if (stateRef.current.jumpTarget >= 0) {
        stateRef.current.jumpTarget = -1;
        clearTimeout(stateRef.current.jumpTimer);
        requestRead();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
    window.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });
    
    if ('onscrollend' in window) {
      window.addEventListener('scrollend', onScrollEnd);
    }
    
    const userInteractions = ['wheel', 'touchstart', 'keydown'];
    userInteractions.forEach(ev => {
      window.addEventListener(ev, () => {
        if (stateRef.current.jumpTarget >= 0) {
          stateRef.current.jumpTarget = -1;
          clearTimeout(stateRef.current.jumpTimer);
          requestRead();
        }
      }, { passive: true });
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scrollend', onScrollEnd);
    };
  }, [requestRead, layout, primeVideo]);

  // Own effect so a later layout update cannot drop the unlock.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    let unlock = () => {};
    const onToggle = () => {
      unlock();
      unlock = menu.open ? lockPageScroll() : () => {};
    };
    menu.addEventListener('toggle', onToggle);
    return () => {
      menu.removeEventListener('toggle', onToggle);
      unlock();
    };
  }, []);

  const activeAccent = config.sections[activeIndex]?.accent;

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className="sw-root relative font-[family:var(--sw-font-body)] text-[var(--sw-ink)]"
      style={{
        '--sw-accent': activeAccent || '',
        '--sw-accent-ink': accentInk(activeAccent),
      } as React.CSSProperties}
    >
      {/* Top Bar */}
      <div className="sw-topbar fixed bg-[color-mix(in_srgb,var(--sw-bg)_78%,transparent)] backdrop-blur-md border-b border-[color-mix(in_srgb,var(--sw-ink)_8%,transparent)] top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 p-[clamp(10px,1.6vw,18px)_clamp(18px,5vw,64px)]">
        {config.brand && (
          <button onClick={() => jumpTo(0)} className="sw-brand shrink-0 flex items-center gap-[10px] no-underline text-[var(--sw-ink)] bg-transparent border-0 p-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)] rounded-xl" aria-label={`${config.brand.name} home`}>
            {config.brand.logo ? (
              <img src={config.brand.logo} alt="" className="sw-brand__logo block h-11 w-auto max-w-[150px] max-sm:h-10 max-sm:max-w-[130px] shrink-0 object-contain rounded-xl bg-[#071b27] px-2.5 py-1 shadow-[0_4px_12px_rgba(7,27,39,0.18)]" />
            ) : (
              <span className="sw-brand__mark w-6 h-7 rounded-[7px_7px_10px_10px] bg-[linear-gradient(160deg,var(--sw-accent),color-mix(in_srgb,var(--sw-accent)_60%,#000))] shadow-[0_6px_14px_color-mix(in_srgb,var(--sw-accent)_40%,transparent)]" />
            )}
          </button>
        )}
        
        <div className="flex items-center gap-6">
          {config.nav !== false && (
            <>
              {/* Desktop Nav */}
              <nav className="sw-nav hidden xl:flex shrink-0 gap-1 p-1.5 bg-[color-mix(in_srgb,#fff_55%,transparent)] backdrop-blur-[10px] border border-[color-mix(in_srgb,var(--sw-accent)_16%,transparent)] rounded-full" aria-label="Main navigation">
                {config.sections.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => jumpTo(i)}
                    className={cn(
                      "sw-nav__item whitespace-nowrap font-inherit text-[0.82rem] border-0 bg-transparent cursor-pointer px-3.5 py-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)]",
                      activeIndex === i ? "text-white" : "text-[var(--sw-ink-soft)] hover:text-[var(--sw-ink)]"
                    )}
                    style={activeIndex === i ? { backgroundColor: accentInk(s.accent), color: '#ffffff' } : undefined}
                    aria-current={activeIndex === i ? 'page' : undefined}
                  >
                    {s.label}
                  </button>
                ))}
                <a
                  href="/brands"
                  onClick={(event) => followBrands(event, onNavigateBrands)}
                  className={navLinkClass}
                >
                  Our brands
                </a>
              </nav>

              {/* Mobile Menu */}
              <details ref={menuRef} className="sw-mobile-menu xl:hidden group">
                <summary className="list-none cursor-pointer flex items-center justify-center w-11 h-11 bg-[color-mix(in_srgb,#fff_55%,transparent)] backdrop-blur-[10px] border border-[color-mix(in_srgb,var(--sw-accent)_16%,transparent)] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)]" aria-label="Open navigation menu">
                  <div className="relative w-5 h-4">
                    <span className="absolute top-0 left-0 w-full h-0.5 bg-[var(--sw-ink)] rounded-full group-open:rotate-45 group-open:top-2 transition-all duration-300"></span>
                    <span className="absolute top-1.5 left-0 w-full h-0.5 bg-[var(--sw-ink)] rounded-full group-open:opacity-0 transition-all duration-300"></span>
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--sw-ink)] rounded-full group-open:-rotate-45 group-open:bottom-2 transition-all duration-300"></span>
                  </div>
                </summary>
                <nav className="fixed top-[74px] right-4 w-52 py-2 bg-white rounded-2xl shadow-xl border border-[rgba(0,0,0,0.05)] overflow-hidden" aria-label="Mobile navigation">
                  {config.sections.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={(e) => {
                        jumpTo(i);
                        (e.currentTarget.closest('details') as HTMLDetailsElement).open = false;
                      }}
                      className={cn(
                        "block w-full text-left px-5 py-3 text-[0.9rem] font-medium transition-colors focus-visible:outline-none focus-visible:bg-gray-100",
                        activeIndex === i ? "text-[var(--sw-accent-ink)] bg-[color-mix(in_srgb,var(--sw-accent-ink)_10%,white)]" : "text-[var(--sw-ink)] active:bg-gray-50"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                  <div className="h-px bg-gray-100 my-1" />
                  <a
                    href="/brands"
                    onClick={(event) => followBrands(event, onNavigateBrands)}
                    className="block w-full px-5 py-3 text-left text-[0.9rem] font-medium text-[var(--sw-ink)] no-underline active:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-100"
                  >
                    Our brands
                  </a>
                </nav>
              </details>
            </>
          )}

          {config.cta && (
            <a href={config.cta.href || '#'} className="sw-topcta hidden sm:inline-flex items-center justify-center no-underline font-semibold text-[0.9rem] text-white bg-[var(--sw-ink)] hover:bg-[#262642] px-5 py-2.5 rounded-full whitespace-nowrap shadow-[0_4px_14px_rgba(26,26,46,0.2)] hover:shadow-[0_6px_18px_rgba(26,26,46,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)] focus-visible:ring-offset-2">
              {config.cta.label}
            </a>
          )}
        </div>
      </div>

      {/* Sky/Atmosphere */}
      <div className="sw-sky fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[var(--sw-bg)]">
        {config.atmosphere !== false && (
          <>
            <div className="sw-sky__grad absolute inset-[-10%] bg-[linear-gradient(178deg,color-mix(in_srgb,var(--sw-accent)_12%,var(--sw-bg))_0%,var(--sw-bg)_55%,color-mix(in_srgb,var(--sw-accent)_6%,var(--sw-bg))_100%)]" />
            <div className="sw-sky__glow absolute inset-0 bg-[radial-gradient(60%_42%_at_74%_16%,color-mix(in_srgb,var(--sw-accent)_22%,transparent),transparent_70%),radial-gradient(46%_34%_at_50%_50%,color-mix(in_srgb,#fff_45%,transparent),transparent_70%)]" />
          </>
        )}
        <div ref={particlesRef} className="sw-particles absolute inset-[-6%_-2%] will-change-transform">
          {!readingMode && !isMobile && <Particles />}
        </div>
      </div>

      {/* Scrollbar */}
      <div className="sw-scrollbar fixed top-0 left-0 right-0 h-[3px] z-60 bg-[color-mix(in_srgb,var(--sw-accent)_14%,transparent)]">
        <span ref={scrollbarFillRef} className="block h-full w-full origin-left scale-x-0 bg-[var(--sw-accent)]" />
      </div>

      {/* Stage */}
      <div ref={stageRef} className="sw-stage fixed inset-0 z-10 pointer-events-none">
        {segments.map((s, i) => (
          <div
            key={`${s.kind}-${i}`}
            ref={(el) => { s.el = el || undefined; }}
            className={cn(
              "sw-scene absolute inset-0 opacity-0 overflow-hidden will-change-opacity",
              s.frameVisible && "is-framed"
            )}
            style={{ '--sw-accent': s.accent || '' } as any}
          >
            <img
              ref={(el) => { s.img = el || undefined; }}
              src={((isMobile && s.stillM && !config.mobileClipsUseDesktopFraming) ? s.stillM : s.still) || ''}
              alt=""
              decoding="async"
              loading="eager"
              className="sw-scene__still absolute inset-0 z-[2] w-full h-full object-cover object-[center_42%] will-change-transform"
            />
            {s.kind === 'dive' && s.si === 0 && (
              <div className="sw-sun-live-fx absolute inset-0 pointer-events-none z-[3]">
                <div className="absolute -top-[14%] left-1/2 -translate-x-1/2 w-[140vw] h-[75vh] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,180,50,0.18)_0%,rgba(255,107,0,0.06)_45%,transparent_75%)] animate-[sw-solar-pulse_6s_ease-in-out_infinite]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,225,130,0.12)_0%,transparent_65%)] animate-[sw-ray-shimmer_7s_ease-in-out_infinite]" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Copy Layer */}
      <div ref={copylayerRef} className="sw-copylayer fixed inset-0 z-20 pointer-events-none">
        <div className="absolute inset-0 w-[min(64vw,840px)] bg-[linear-gradient(90deg,var(--sw-bg)_0%,color-mix(in_srgb,var(--sw-bg)_92%,transparent)_38%,color-mix(in_srgb,var(--sw-bg)_70%,transparent)_68%,transparent_100%)] md:block hidden" />
        <div className="absolute inset-0 w-full h-3/5 top-auto bottom-0 bg-[linear-gradient(0deg,var(--sw-bg)_22%,color-mix(in_srgb,var(--sw-bg)_82%,transparent)_50%,transparent_100%)] md:hidden" />
        
        {config.sections.map((s, i) => (
          <article
            key={s.id}
            id={s.id}
            aria-label={s.label || s.title}
            className={cn(
              "sw-copy absolute left-[clamp(18px,5vw,64px)] opacity-0 will-change-[opacity,transform] md:block flex flex-col items-start max-md:right-[clamp(18px,5vw,64px)] max-md:top-auto max-md:bottom-[calc(clamp(32px,8dvh,70px)+env(safe-area-inset-bottom))] max-md:w-auto max-md:max-w-[560px]",
              s.id === 'home'
                ? "top-[clamp(65px,8.5vh,92px)] w-[min(48vw,520px)] max-lg:w-[min(54vw,500px)]"
                : "top-[max(112px,calc(56%-170px))] w-[min(42vw,460px)]"
            )}
            style={{ '--sw-accent': s.accent || '', '--sw-accent-ink': accentInk(s.accent) } as React.CSSProperties}
          >
            <p className={cn("sw-copy__step max-md:hidden flex items-center gap-1 font-mono text-[0.74rem] tracking-[0.12em] text-[var(--sw-ink-soft)]", s.id === 'home' ? "mb-1" : "mb-4")}>
              <span>{pad(i + 1)}</span>
              <span aria-hidden="true">/</span>
              <span>{pad(config.sections.length)}</span>
              <span className="sr-only">Step {i + 1} of {config.sections.length}</span>
            </p>

            {s.eyebrow && (
              <p className="sw-copy__eyebrow block font-[family:var(--sw-font-display)] font-bold text-[0.8rem] tracking-[0.16em] uppercase text-[var(--sw-accent-ink)]">
                {s.eyebrow}
              </p>
            )}
            {s.title && (
              i === 0 ? (
                <h1 className="sw-copy__title font-[family:var(--sw-font-display)] font-bold text-[var(--sw-ink)] text-[clamp(2rem,4.4vw,3.5rem)] leading-[1.03] mt-3 tracking-tight drop-shadow-[0_2px_20px_color-mix(in_srgb,var(--sw-bg)_70%,transparent)]">
                  {s.title}
                </h1>
              ) : (
                <h2 className={cn(
                  "sw-copy__title font-[family:var(--sw-font-display)] font-bold text-[var(--sw-ink)] leading-[1.03] tracking-tight drop-shadow-[0_2px_20px_color-mix(in_srgb,var(--sw-bg)_70%,transparent)]",
                  s.id === 'home' ? "mt-1.5 text-[clamp(1.75rem,3.2vw,2.5rem)]" : "mt-3 text-[clamp(2rem,4.4vw,3.5rem)]"
                )}>
                  {s.title}
                </h2>
              )
            )}
            {s.body && (
              <p className={cn(
                "sw-copy__body text-[color-mix(in_srgb,var(--sw-ink)_78%,var(--sw-ink-soft))] max-w-[42ch] drop-shadow-[0_1px_12px_color-mix(in_srgb,var(--sw-bg)_90%,transparent)]",
                s.id === 'home' ? "mt-1.5 text-[clamp(0.85rem,1.05vw,0.96rem)] leading-[1.4]" : "mt-4.5 text-[clamp(1rem,1.25vw,1.14rem)] leading-[1.55]"
              )}>
                {s.body}
              </p>
            )}

            {s.tags && s.tags.length > 0 && (
              <ul className="sw-copy__benefits max-md:hidden flex flex-wrap gap-2 mt-6 p-0 list-none" aria-label={`${s.title} benefits`}>
                {s.tags.map(tag => (
                  <li key={tag} className="text-[0.82rem] font-semibold text-[color-mix(in_srgb,var(--sw-accent-ink)_70%,#000)] px-3.5 py-1.5 rounded-full bg-[color-mix(in_srgb,var(--sw-accent-ink)_14%,#fff)] border border-[color-mix(in_srgb,var(--sw-accent-ink)_30%,transparent)]">
                    {tag}
                  </li>
                ))}
              </ul>
            )}
            {s.cta && (
              <div className="sw-copy__cta max-md:hidden flex flex-wrap gap-3 mt-7 pointer-events-auto">
                {s.cta.primary && (
                  <a href={s.cta.primary.href} className="sw-btn sw-btn--primary no-underline font-semibold text-[0.95rem] px-6 py-3 rounded-full text-white bg-[var(--sw-ink)] hover:bg-[#262642] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 shadow-[0_6px_20px_rgba(26,26,46,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)] focus-visible:ring-offset-2">
                    {s.cta.primary.label}
                  </a>
                )}
                {s.cta.secondary && (
                  <a href={s.cta.secondary.href} className="sw-btn sw-btn--ghost no-underline font-semibold text-[0.95rem] px-6 py-3 rounded-full text-[var(--sw-ink)] bg-white/60 backdrop-blur-sm border-[1.5px] border-[color-mix(in_srgb,var(--sw-ink)_25%,transparent)] hover:border-[var(--sw-ink)] hover:bg-white/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent)] focus-visible:ring-offset-2">
                    {s.cta.secondary.label}
                  </a>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Progress Rail (Side Dots) */}
      <nav className="sw-route max-md:hidden fixed right-[clamp(14px,2.4vw,30px)] top-1/2 z-40 -translate-y-1/2 flex flex-col gap-[22px] p-[18px_10px] max-md:right-1.5 max-md:gap-4" aria-label="Journey progress">
        <div className="absolute left-1/2 top-[22px] bottom-[22px] w-[2px] -translate-x-1/2 bg-[var(--sw-accent)] opacity-28" />
        {config.sections.map((s, i) => (
          <button
            key={s.id}
            onClick={() => jumpTo(i)}
            className={cn(
              "sw-route__dot relative border-0 bg-transparent cursor-pointer w-3.5 h-3.5 md:w-3.5 md:h-3.5 flex items-center justify-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sw-accent-ink)] rounded-full",
              activeIndex === i && "is-active",
              "pointer-coarse:w-7 pointer-coarse:h-7"
            )}
            aria-label={`Step ${i + 1}: ${s.label || s.title}`}
            aria-current={activeIndex === i ? 'step' : undefined}
            style={{ '--sw-accent': s.accent || '', '--sw-accent-ink': accentInk(s.accent) } as React.CSSProperties}
          >
            <i
              className={cn(
                "w-[9px] h-[9px] rounded-full bg-[color-mix(in_srgb,var(--sw-accent-ink)_40%,transparent)] transition-all duration-300",
                "group-hover:scale-125 group-hover:bg-[var(--sw-accent-ink)]",
                activeIndex === i && "scale-[1.4] shadow-[0_0_0_5px_color-mix(in_srgb,var(--sw-accent-ink)_22%,transparent)]"
              )}
              style={activeIndex === i ? { backgroundColor: accentInk(s.accent) } : undefined}
            />
            <span className={cn(
              "sw-route__label absolute right-6 top-1/2 -translate-y-1/2 translate-x-1.5 whitespace-nowrap text-[0.78rem] font-semibold text-[var(--sw-ink)] bg-[color-mix(in_srgb,#fff_85%,transparent)] backdrop-blur-[6px] px-2.5 py-1 rounded-full opacity-0 pointer-events-none transition-all duration-250 border border-[color-mix(in_srgb,var(--sw-accent)_14%,transparent)]",
              activeIndex === i && "opacity-100 translate-x-0",
              "md:group-hover:opacity-100 md:group-hover:translate-x-0 hidden md:block"
            )}>
              {s.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Hint */}
      <div ref={hintRef} className="sw-hint fixed left-1/2 bottom-[26px] z-30 -translate-x-1/2 flex flex-col items-center gap-2.5 text-[0.76rem] tracking-[0.14em] uppercase text-[var(--sw-ink-soft)] transition-opacity duration-300 max-md:bottom-[calc(84px+env(safe-area-inset-bottom))]">
        <span className="hint-text">{config.hint || 'scroll'}</span>
        <i className="w-[22px] h-[34px] rounded-[12px] border-2 border-[color-mix(in_srgb,var(--sw-ink)_28%,transparent)] relative after:content-[''] after:absolute after:left-1/2 after:top-[7px] after:w-1 after:h-[7px] after:rounded-[2px] after:bg-[var(--sw-accent)] after:-translate-x-1/2 after:animate-[sw-wheel_1.7s_ease-in-out_infinite]" />
      </div>

      {/* Scroll Track */}
      <div ref={trackRef} className="sw-track relative z-1 w-full pointer-events-none [overflow-anchor:none]" />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes sw-wheel {
          0% { opacity: 0; top: 6px; }
          40% { opacity: 1; }
          100% { opacity: 0; top: 17px; }
        }
        @keyframes sw-drift {
          0% { opacity: 0; transform: scale(var(--sw-sc)) translate(0, 12vh) rotate(0); }
          12% { opacity: .5; }
          88% { opacity: .45; }
          100% { opacity: 0; transform: scale(var(--sw-sc)) translate(4vw, -22vh) rotate(210deg); }
        }
        @keyframes sw-solar-pulse {
          0%, 100% { opacity: 0.72; transform: translate(-50%, 0) scale(1); }
          50% { opacity: 1; transform: translate(-50%, 0) scale(1.04); }
        }
        @keyframes sw-ray-shimmer {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 0.95; }
        }
        @keyframes sw-flow-dash-right {
          from { stroke-dashoffset: 28; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes sw-flow-dash-down {
          from { stroke-dashoffset: 28; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes sw-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .sw-scene__still { opacity: 1; }
        .sw-scene.is-framed .sw-scene__still {
          opacity: 0;
          transition: opacity 180ms linear;
        }
        .sw-copy__eyebrow,
        .sw-copy__title,
        .sw-copy__body,
        .sw-copy__benefits li {
          text-shadow: 0 1px 0 rgba(255,255,255,0.72), 0 8px 18px rgba(232,244,253,0.92);
        }

        /* Phones: the scenes are wide (16:9) shots. Filling a tall phone
           screen cropped them to about a quarter of their width. Show them in
           a band under the bar instead (two-thirds of the width or more),
           fading into the page above the headline. */
        @media (max-width: 767px) {
          .sw-stage {
            top: calc(64px + env(safe-area-inset-top));
            bottom: auto;
            height: min(84vw, 42vh);
            /* Ends just above the headline: the text block needs ~460px. */
            height: clamp(160px, calc(100svh - 494px), 84vw);
            -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 80%, transparent 100%);
            mask-image: linear-gradient(180deg, #000 0%, #000 80%, transparent 100%);
          }
        }

        @media (max-width: 640px) {
          .sw-topbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            min-height: 64px;
            padding: 10px 16px;
            background: rgba(245, 250, 249, 0.96);
          }
          .sw-brand {
            min-width: 0;
            max-width: 65%;
          }
          .sw-copy {
            padding: 24px 20px 112px;
          }
          .sw-copy__title {
            margin: 0;
            font-size: clamp(2.25rem, 10vw, 3.5rem);
            line-height: 0.98;
            overflow-wrap: anywhere;
          }
          .sw-topcta {
            display: none;
          }
        }
      ` }} />
    </div>
  );
}

function Particles() {
  const kinds = ['dot', 'dot', 'ring'];
  const seeds = [7, 23, 41, 58, 71, 88, 12, 34, 52, 66, 83, 95, 18, 29, 47, 63, 77, 91, 5, 38, 55, 69, 82, 97];
  
  return (
    <>
      {Array.from({ length: 20 }).map((_, k) => {
        const kind = kinds[k % kinds.length];
        const left = seeds[k % seeds.length];
        const top = (seeds[(k * 3) % seeds.length] * 1.3) % 100;
        const scale = (0.5 + ((seeds[(k * 5) % seeds.length] % 60) / 60) * 1.1).toFixed(2);
        const dur = 14 + (seeds[(k * 7) % seeds.length] % 22);
        const delay = -(seeds[(k * 2) % seeds.length] % dur);
        
        return (
          <span
            key={k}
            className={cn(
              "sw-pt absolute w-[13px] h-[13px] opacity-0 animate-[sw-drift_linear_infinite] before:content-[''] before:absolute before:inset-0 before:rounded-full",
              kind === 'dot' 
                ? "before:bg-[radial-gradient(circle_at_34%_30%,color-mix(in_srgb,var(--sw-accent)_60%,#000),#000_82%)]" 
                : "before:bg-transparent before:border-2 before:border-[color-mix(in_srgb,var(--sw-accent)_55%,transparent)]"
            )}
            style={{
              left: `${left}vw`,
              top: `${top}vh`,
              '--sw-sc': scale,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            } as any}
          />
        );
      })}
    </>
  );
}
