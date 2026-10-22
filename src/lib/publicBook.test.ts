import { describe, expect, it } from 'vitest';
import { composePublicBook } from './publicBook';

const claim = 'ab'.repeat(32);

describe('composePublicBook', () => {
  it('adds meter status and a bill claim without other customer data', () => {
    const body = composePublicBook({
      startsAt: '2026-10-28T14:00:00.000Z',
      endsAt: '2026-10-28T15:00:00.000Z',
      upload: null,
      billClaim: claim,
      meterStatus: 'pending_setup',
    });
    expect(body.meter).toEqual({ status: 'pending_setup' });
    expect(body.billClaim).toBe(claim);
    expect(JSON.stringify(body)).not.toContain('esi');
    expect(Object.keys(body).sort()).toEqual(['billClaim', 'endsAt', 'meter', 'ok', 'startsAt']);
  });

  it('keeps the signed upload and drops the claim when a file was already chosen', () => {
    const body = composePublicBook({
      startsAt: '2026-10-28T14:00:00.000Z',
      endsAt: '2026-10-28T15:00:00.000Z',
      upload: {
        signedUrl: 'https://powergenie.supabase.co/storage/v1/object/upload/sign/light-bills/bills/22222222-2222-4222-8222-222222222222-october.pdf?token=upload-token',
        confirmToken: claim,
      },
      billClaim: claim,
      meterStatus: null,
    });
    expect(body.upload?.confirmToken).toBe(claim);
    expect(body.billClaim).toBeUndefined();
    expect(body.meter).toBeUndefined();
  });
});
