import { isConfirmToken, toPublicBookBody, type BillUploadGrant } from './lightBill';
import type { SmtStatus } from './smt';

const METER_STATUSES = new Set<SmtStatus>(['pending_setup', 'requested', 'approved', 'expired', 'failed']);

export function composePublicBook(result: {
  startsAt: string;
  endsAt: string;
  upload: BillUploadGrant | null;
  billClaim: string | null;
  meterStatus: string | null;
}): {
  ok: true;
  startsAt: string;
  endsAt: string;
  upload?: BillUploadGrant;
  billClaim?: string;
  meter?: { status: SmtStatus };
} {
  const body = toPublicBookBody(result);
  const meterStatus = result.meterStatus && METER_STATUSES.has(result.meterStatus as SmtStatus)
    ? result.meterStatus as SmtStatus
    : null;
  return {
    ...body,
    ...(body.upload ? {} : result.billClaim && isConfirmToken(result.billClaim) ? { billClaim: result.billClaim } : {}),
    ...(meterStatus ? { meter: { status: meterStatus } } : {}),
  };
}
