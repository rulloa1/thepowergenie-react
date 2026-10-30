import { describe, expect, it, vi } from 'vitest';
import { availableBookingSlot } from './BookingPage';

vi.mock('../lib/supabase', () => ({ supabase: null, callFunction: vi.fn() }));

const selected = { start: '2026-11-02T15:00:00.000Z', end: '2026-11-02T16:00:00.000Z' };

describe('booking appointment selection', () => {
  it('rejects booking without a chosen appointment, including when the calendar is empty', () => {
    expect(availableBookingSlot('ready', [], null)).toBeNull();
    expect(availableBookingSlot('ready', [selected], null)).toBeNull();
  });

  it('rejects stale selections after availability is removed or the appointment duration changes', () => {
    expect(availableBookingSlot('ready', [], selected)).toBeNull();
    expect(availableBookingSlot('ready', [{ ...selected, end: '2026-11-02T17:00:00.000Z' }], selected)).toBeNull();
  });

  it.each(['loading', 'unavailable', 'error', 'not_configured'] as const)(
    'rejects cached availability while the calendar is %s', (state) => {
      expect(availableBookingSlot(state, [selected], selected)).toBeNull();
    },
  );

  it('uses only the appointment returned in the current ready calendar', () => {
    const available = { ...selected };
    expect(availableBookingSlot('ready', [available], selected)).toBe(available);
  });
});
