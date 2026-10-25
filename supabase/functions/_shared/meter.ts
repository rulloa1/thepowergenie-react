// Same rules as src/lib/esiId.ts. Kept here so the booking function does not
// import the Vite app.

export const METER_CONSENT_TEXT =
  'I agree to share my Smart Meter Texas electricity usage with The Power Genie so Horace can review it before our call. Smart Meter Texas will email me to approve this. I can say no and still book the call.';

export type MeterRequest = {
  esiId: string;
  meterNumber: string;
  email: string;
  consent: true;
};

export type MeterResult =
  | { ok: true; value: MeterRequest | null }
  | { ok: false; message: string };

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateEsiId(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{17,22}$/.test(digits) ? digits : null;
}

function validateMeterNumber(value: string): string | null {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9-]{1,30}$/.test(cleaned)) return null;
  return cleaned;
}

export function readMeterRequest(input: {
  esiId: string;
  meterNumber: string;
  email: string;
  consent: boolean;
}, fallbackEmail: string): MeterResult {
  const blank = !input.esiId.trim() && !input.meterNumber.trim() && !input.email.trim() && !input.consent;
  if (blank) return { ok: true, value: null };
  if (!input.consent) {
    return { ok: false, message: 'Check the box to share usage, or leave the meter fields blank.' };
  }
  const esiId = validateEsiId(input.esiId);
  if (!esiId) return { ok: false, message: 'Enter the ESI ID from the bill. It is 17 to 22 digits.' };
  const meterNumber = validateMeterNumber(input.meterNumber);
  if (!meterNumber) return { ok: false, message: 'Enter the meter number from the bill.' };
  const email = input.email.trim() || fallbackEmail.trim();
  if (!emailOk(email) || email.length > 64) return { ok: false, message: 'Enter the email Smart Meter Texas should use.' };
  return { ok: true, value: { esiId, meterNumber, email, consent: true } };
}
