import { chicagoParts, zonedWallTimeToUtc } from './chicagoTime';
import type { MeterRequest } from './esiId';

export const SMT_PRODUCTION_BASE = 'https://services.smartmetertexas.net';

export const SMT_PATHS = {
  newAgreement: '/NewAgreement/',
  agreements: '/myagreements/',
  monthly: '/monthlybillingInformation/',
  intervals: '/15minintervalreads/',
} as const;

export type SmtStatus = 'pending_setup' | 'requested' | 'approved' | 'expired' | 'failed';

export type SmtCaller = {
  requestorId: string;
  duns: string;
};

export function smtDate(date: Date): string {
  const parts = chicagoParts(date);
  return `${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}/${parts.year}`;
}

export function smtTransId(now = Date.now()): string {
  return now.toString(36).replace(/[^a-z0-9]/gi, '').slice(0, 32) || 'smt1';
}

/**
 * Body for SMT Interface Guide section 3.1.1.13, POST /NewAgreement/.
 * The published example also sends PUCTRORNumber (the REP certificate).
 * TODO(smt-puct): The guide does not say whether that field is required for an
 * independent third party. It is omitted until SMT confirms it, because we do
 * not collect a REP certificate number from the customer.
 */
export function newAgreementBody(caller: SmtCaller, meter: MeterRequest, transId: string) {
  return {
    trans_id: transId,
    requestorID: caller.requestorId,
    requesterAuthenticationID: caller.duns,
    retailCustomerEmail: meter.email,
    agreementDuration: 12,
    customerLanguagePreference: 'ENGLISH',
    customerMeterList: [{ ESIID: meter.esiId, meterNumber: meter.meterNumber }],
    SMTTermsandConditions: 'Y',
  };
}

export function agreementLookupBody(caller: SmtCaller, agreementNumber: string, transId: string) {
  return {
    trans_id: transId,
    requestorID: caller.requestorId,
    requesterAuthenticationID: caller.duns,
    agreementNumber: Number(agreementNumber),
    SMTTermsandConditions: 'Y',
  };
}

/**
 * requesterType "CSP" is the third-party role in the agreement section.
 * TODO(smt-requester-type): The usage section's enum is only shown as "Array [ 12 ]"
 * and its examples use "RES". If SMT rejects CSP, change this one constant.
 */
export function usageBody(input: {
  caller: SmtCaller;
  esiId: string;
  start: Date;
  end: Date;
  transId: string;
}) {
  return {
    trans_id: input.transId,
    requestorID: input.caller.requestorId,
    requesterType: 'CSP',
    requesterAuthenticationID: input.caller.duns,
    startDate: smtDate(input.start),
    endDate: smtDate(input.end),
    reportFormat: 'JSON',
    version: 'L',
    readingType: 'C',
    esiid: [input.esiId],
    SMTTermsandConditions: 'Y',
  };
}

export type MonthlyUsage = { periodStart: string; periodEnd: string; kwh: number };
export type IntervalUsage = { intervalStart: string; kwh: number; quality: string | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseMonthlyUsage(json: unknown): MonthlyUsage[] {
  const record = asRecord(json);
  const rows = record && Array.isArray(record.billingData) ? record.billingData : [];
  const usage: MonthlyUsage[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const periodStart = isoDate(row.startDate);
    const periodEnd = isoDate(row.endDate);
    const kwh = typeof row.actualkWh === 'string' || typeof row.actualkWh === 'number'
      ? Number(row.actualkWh)
      : Number.NaN;
    if (!periodStart || !periodEnd || !Number.isFinite(kwh)) continue;
    usage.push({ periodStart, periodEnd, kwh });
  }
  return usage;
}

/**
 * RD is a comma-separated list of kWh readings for one date, from the guide's
 * synchronous interval example. Empty positions are missing intervals.
 * TODO(smt-interval-clock): The guide does not name the timezone of position 0.
 * These stamps use America/Chicago midnight of the DT date, then 15 minutes each.
 */
export function parseIntervalUsage(json: unknown): IntervalUsage[] {
  const record = asRecord(json);
  const rows = record && Array.isArray(record.energyData) ? record.energyData : [];
  const usage: IntervalUsage[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    if (!row || typeof row.RD !== 'string') continue;
    const day = isoDate(row.DT);
    if (!day) continue;
    const [year, month, date] = day.split('-').map(Number);
    row.RD.split(',').forEach((part, index) => {
      const match = /^(\d*\.?\d+)-([A-Za-z])$/.exec(part.trim());
      if (!match) return;
      const kwh = Number(match[1]);
      if (!Number.isFinite(kwh)) return;
      const minuteOfDay = index * 15;
      const start = zonedWallTimeToUtc(year, month, date, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
      usage.push({
        intervalStart: start.toISOString(),
        kwh,
        quality: match[2].toUpperCase(),
      });
    });
  }
  return usage;
}

export function responseIsAsyncAck(json: unknown): boolean {
  const record = asRecord(json);
  if (!record || typeof record.correlationId !== 'string') return false;
  return !Array.isArray(record.billingData) && !Array.isArray(record.energyData);
}

export function mapAgreementStatus(raw: string | null | undefined): Exclude<SmtStatus, 'pending_setup'> {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'requested';
  if (value.includes('pending') || value === 'pen') return 'requested';
  if (value.includes('active') || value === 'act') return 'approved';
  if (value.includes('expir') || value === 'com' || value.includes('completed')) return 'expired';
  if (value.includes('terminat') || value.includes('not accepted') || value.includes('fail') || value === 'flr') {
    return 'failed';
  }
  return 'requested';
}

export function readAgreementNumber(json: unknown): string | null {
  const record = asRecord(json);
  if (!record) return null;
  const number = record.agreementNumber;
  if (typeof number === 'number' || typeof number === 'string') return String(number);
  return null;
}

export function readAgreementStatusRaw(json: unknown): string | null {
  const record = asRecord(json);
  const list = record && Array.isArray(record.agreementStatusList) ? record.agreementStatusList : [];
  const first = asRecord(list[0]);
  if (!first) return null;
  return typeof first.status === 'string' ? first.status : null;
}

export function readSmtError(json: unknown): string | null {
  const record = asRecord(json);
  if (!record) return null;
  const reason = record.statusReason ?? record.errorMessage ?? record.error;
  return typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 240) : null;
}

/**
 * The public Interface Guide's error table says a missing username and password
 * is "Basic authentication header is missing." A May 2025 market notice says the
 * non-JWT API was turned off on 13 September 2025. The new token URL is not in
 * that public PDF.
 * TODO(smt-jwt): When SMT sends the portal guide "FTPS and API Security Upgrade",
 * replace this. A pasted SMT_API_TOKEN is sent as Bearer. Otherwise Basic is used.
 */
export function smtAuthorizationHeader(input: { username: string; portalPassword: string; token: string | null }): string {
  if (input.token) return `Bearer ${input.token}`;
  return `Basic ${btoa(`${input.username}:${input.portalPassword}`)}`;
}
