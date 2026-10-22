import { describe, expect, it } from 'vitest';
import { allowRate, clientRateKey } from './rateLimit';

describe('allowRate', () => {
  it('allows 15 calls in the window and blocks the next one', () => {
    const bucket = new Map<string, number[]>();
    for (let index = 0; index < 15; index += 1) {
      expect(allowRate(bucket, '203.0.113.8', 1_000 + index, 15, 600_000)).toBe(true);
    }
    expect(allowRate(bucket, '203.0.113.8', 2_000, 15, 600_000)).toBe(false);
    expect(allowRate(bucket, '203.0.113.9', 2_000, 15, 600_000)).toBe(true);
    expect(allowRate(bucket, '203.0.113.8', 1_000 + 600_000, 15, 600_000)).toBe(true);
  });

  it('uses the first forwarded hop and ignores a junk header', () => {
    expect(clientRateKey('203.0.113.8, 10.0.0.1')).toBe('203.0.113.8');
    expect(clientRateKey('not an address')).toBe('unknown');
    expect(clientRateKey(undefined)).toBe('unknown');
  });
});
