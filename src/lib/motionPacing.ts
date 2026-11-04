import profiles from '../data/motion-profile.json';

/**
 * Motion-matched scrubbing. Each clip's camera speeds up and slows down on its
 * own (most of them ease to a near stop at the end), so mapping scroll straight
 * to time makes the film crawl, then lurch. The profile in
 * src/data/motion-profile.json (from scripts/motion-profile.py) records how
 * much the picture moves through each clip; scroll is handed out by that motion
 * instead, so equal scroll gives equal on-screen movement.
 */

/** Share of plain time kept in the mapping so frames with no motion still scrub. */
const LINEAR_SHARE = 0.15;

type RawProfile = { total: number; curve: number[] };
export type MotionCurve = number[];

const cache = new Map<string, MotionCurve | null>();

export function blendCurve(curve: number[]): MotionCurve {
  const n = curve.length - 1;
  return curve.map((c, k) => (1 - LINEAR_SHARE) * c + LINEAR_SHARE * (k / n));
}

/** The blended curve for a clip URL, matched by file name; null when unknown. */
export function motionCurve(url: string | null | undefined): MotionCurve | null {
  if (!url) return null;
  const name = url.split('?')[0].split('/').pop() || '';
  if (cache.has(name)) return cache.get(name) ?? null;
  const p = (profiles as Record<string, RawProfile>)[name];
  const curve = p && p.total > 0 && p.curve?.length > 1 ? blendCurve(p.curve) : null;
  cache.set(name, curve);
  return curve;
}

/** Share of the clip's motion (0..1) → clip time (0..1). Monotone, f(0)=0, f(1)=1. */
export function timeForMotion(curve: MotionCurve, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const n = curve.length - 1;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid] < x) lo = mid;
    else hi = mid;
  }
  const span = curve[hi] - curve[lo];
  return (lo + (span > 0 ? (x - curve[lo]) / span : 0)) / n;
}
