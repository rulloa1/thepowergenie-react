import { expect, it } from 'vitest';
import { readBookingReferral, referralFromNote, referralNoteHeader } from './bookingReferral';

it('preserves the rep and state through a booking service that only saves notes', () => {
  const referral = readBookingReferral(new URLSearchParams('ref=Dashboard-QA&state=tx'));
  const note = referralNoteHeader(referral.rep, referral.state) + 'Call after work.';
  expect(referralFromNote(note)).toEqual({ rep: 'Dashboard-QA', state: 'TX' });
});

it('leaves direct bookings and ordinary homeowner notes unattributed', () => {
  expect(referralNoteHeader('', '')).toBe('');
  expect(referralFromNote('Referred by my neighbor')).toEqual({ rep: '', state: '' });
});
