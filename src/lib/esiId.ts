import { SMT_CONSENT_TEXT } from '../../shared/types';

export const METER_CONSENT_TEXT = SMT_CONSENT_TEXT;

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

export function validateEsiId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{17,22}$/.test(digits) ? digits : null;
}

export function validateMeterNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9-]{1,30}$/.test(cleaned)) return null;
  return cleaned;
}

export function readMeterRequest(input: unknown, fallbackEmail: string): MeterResult {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== 'object') return { ok: false, message: 'Check the meter details.' };
  const record = input as Record<string, unknown>;
  const esiRaw = typeof record.esiId === 'string' ? record.esiId : '';
  const meterRaw = typeof record.meterNumber === 'string' ? record.meterNumber : '';
  const emailRaw = typeof record.email === 'string' ? record.email.trim() : '';
  const consent = record.consent === true;
  const blank = !esiRaw.trim() && !meterRaw.trim() && !emailRaw && !consent;
  if (blank) return { ok: true, value: null };
  if (!consent) {
    return { ok: false, message: 'Check the box to share usage, or leave the meter fields blank.' };
  }
  const esiId = validateEsiId(esiRaw);
  if (!esiId) return { ok: false, message: 'Enter the ESI ID from the bill. It is 17 to 22 digits.' };
  const meterNumber = validateMeterNumber(meterRaw);
  if (!meterNumber) return { ok: false, message: 'Enter the meter number from the bill.' };
  const email = emailRaw || fallbackEmail.trim();
  if (!emailOk(email) || email.length > 64) return { ok: false, message: 'Enter the email Smart Meter Texas should use.' };
  return { ok: true, value: { esiId, meterNumber, email, consent: true } };
}
