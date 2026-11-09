import { describe, expect, it } from 'vitest';
import { blendCurve, motionCurve, timeForMotion } from './motionPacing';

describe('motion pacing', () => {
  it('keeps the clip ends fixed', () => {
    const c = blendCurve([0, 0.1, 0.9, 1]);
    expect(timeForMotion(c, 0)).toBe(0);
    expect(timeForMotion(c, 1)).toBe(1);
  });

  it('spends little scroll on still frames and more on moving ones', () => {
    // All the motion happens in the middle third of the clip.
    const c = blendCurve([0, 0, 1, 1]);
    // Reaching half the motion takes us to the middle of the clip...
    expect(timeForMotion(c, 0.5)).toBeCloseTo(0.5, 5);
    // ...and the still first third is crossed in a small share of the scroll.
    expect(timeForMotion(c, 0.06)).toBeGreaterThan(0.3);
  });

  it('is monotone', () => {
    const c = blendCurve([0, 0.02, 0.05, 0.5, 0.95, 1, 1, 1]);
    let prev = -1;
    for (let k = 0; k <= 100; k++) {
      const t = timeForMotion(c, k / 100);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('finds the profile of every scene clip', () => {
    for (const s of ['01-sun', '02-roof', '03-battery', '04-home', '05-community', '06-cta']) {
      expect(motionCurve(`assets-v2/vid/encoded/${s}-loop.mp4`)).not.toBeNull();
      expect(motionCurve(`assets-v2/vid/mobile/${s}-loop.mp4`)).not.toBeNull();
    }
    expect(motionCurve('assets/vid/unknown.mp4')).toBeNull();
  });
});
