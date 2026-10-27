import { describe, expect, it } from 'vitest';
import { stageOpacity } from './ScrollWorld';

// Scene A (0-1000), a transition with no clip (1000-1500), scene B (1500-2500).
const dissolve = [
  { start: 0, end: 1000 },
  { start: 1000, end: 1500, empty: true },
  { start: 1500, end: 2500 },
];

describe('stageOpacity', () => {
  it('never shows a transition that has no clip', () => {
    for (const y of [900, 1000, 1250, 1499, 1600]) {
      expect(stageOpacity(y, 1, dissolve, 80)).toBe(0);
    }
  });

  it('holds the outgoing scene until the incoming one fully covers it', () => {
    expect(stageOpacity(1000, 0, dissolve, 80)).toBe(1);
    expect(stageOpacity(1499, 0, dissolve, 80)).toBe(1);
    expect(stageOpacity(1500, 0, dissolve, 80)).toBe(0);
  });

  it('dissolves the incoming scene in across the whole transition', () => {
    expect(stageOpacity(1000, 2, dissolve, 80)).toBe(0);
    expect(stageOpacity(1250, 2, dissolve, 80)).toBeCloseTo(0.5, 5);
    expect(stageOpacity(1500, 2, dissolve, 80)).toBe(1);
    // Rising the whole way, so the picture never parks.
    let last = -1;
    for (let y = 1000; y <= 1500; y += 25) {
      const op = stageOpacity(y, 2, dissolve, 80);
      expect(op).toBeGreaterThanOrEqual(last);
      last = op;
    }
  });

  it('keeps the short edge blend around a transition that has a clip', () => {
    const clip = [
      { start: 0, end: 1000 },
      { start: 1000, end: 2000 },
      { start: 2000, end: 3000 },
    ];
    expect(stageOpacity(1000, 0, clip, 80)).toBeCloseTo(0.5, 5);
    expect(stageOpacity(1000, 1, clip, 80)).toBeCloseTo(0.5, 5);
    expect(stageOpacity(1500, 1, clip, 80)).toBe(1);
    expect(stageOpacity(1500, 0, clip, 80)).toBe(0);
  });
});
