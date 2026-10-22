import { describe, expect, it } from 'vitest';
import { readMeterRequest, validateEsiId, validateMeterNumber } from './esiId';

describe('validateEsiId', () => {
  it('accepts 17 to 22 digits and strips spaces', () => {
    expect(validateEsiId('10032789400250865')).toHaveLength(17);
    expect(validateEsiId('1008901012126195372100')).toHaveLength(22);
    expect(validateEsiId('1003 2789 4002 50865')).toBe('10032789400250865');
    expect(validateEsiId('1234567890123456')).toBeNull();
    expect(validateEsiId('12345678901234567890123')).toBeNull();
    expect(validateEsiId('10032789400250865a')).toBeNull();
  });
});

describe('validateMeterNumber', () => {
  it('keeps a bill meter number and rejects an empty one', () => {
    expect(validateMeterNumber('144054330')).toBe('144054330');
    expect(validateMeterNumber('')).toBeNull();
    expect(validateMeterNumber('meter number')).toBeNull();
  });
});

describe('readMeterRequest', () => {
  const meter = {
    esiId: '10032789400250865',
    meterNumber: '144054330',
    email: 'jamie@example.com',
    consent: true,
  };

  it('allows a booking with no meter fields', () => {
    expect(readMeterRequest(null, 'jamie@example.com')).toEqual({ ok: true, value: null });
    expect(readMeterRequest({}, 'jamie@example.com')).toEqual({ ok: true, value: null });
  });

  it('requires consent and a valid ESI ID before saving a meter', () => {
    expect(readMeterRequest({ ...meter, consent: false }, 'jamie@example.com').ok).toBe(false);
    expect(readMeterRequest({ ...meter, esiId: '12' }, 'jamie@example.com').ok).toBe(false);
    const result = readMeterRequest({ ...meter, email: '' }, 'jamie@example.com');
    expect(result.ok).toBe(true);
    if (result.ok && result.value) expect(result.value.email).toBe('jamie@example.com');
  });
});
