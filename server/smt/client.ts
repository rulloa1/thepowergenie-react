import https from 'node:https';
import {
  SMT_PATHS,
  agreementLookupBody,
  newAgreementBody,
  parseIntervalUsage,
  parseMonthlyUsage,
  readAgreementNumber,
  readAgreementStatusRaw,
  readSmtError,
  responseIsAsyncAck,
  smtAuthorizationHeader,
  smtTransId,
  usageBody,
  mapAgreementStatus,
  type IntervalUsage,
  type MonthlyUsage,
  type SmtStatus,
} from '../../src/lib/smt.js';
import type { MeterRequest } from '../../src/lib/esiId.js';
import type { SmtConfig } from './config.js';

/**
 * HTTP adapter for the Smart Meter Texas Interface Guide REST calls.
 * Authentication is isolated here on purpose.
 *
 * The public guide's error table requires a Basic username and password, and
 * section 2 also describes a client SSL certificate plus a static IP.
 * A May 2025 market notice says the API without a JWT was turned off on
 * 13 September 2025, and that client SSL is no longer required after that.
 * The new token URL is not in the public PDF. It is on the logged-in portal
 * under "FTPS and API Security Upgrade".
 *
 * TODO(smt-jwt): When SMT support sends that guide, change smtAuthorizationHeader
 * only. Do not guess a token endpoint. SMT_API_TOKEN, when set, is sent as Bearer.
 * SMT_CLIENT_CERT and SMT_CLIENT_KEY are attached only when both are set, because
 * the older guide requires mutual TLS and the 2025 notice says it may no longer apply.
 */

type SmtResponse = { status: number; json: unknown };

export async function smtPost(config: SmtConfig, path: string, body: unknown): Promise<SmtResponse> {
  const url = new URL(path, `${config.base}/`);
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    'user-agent': 'PowerGenie/1.0',
    authorization: smtAuthorizationHeader(config),
  };
  if (config.cert && config.key) return postWithCertificate(url, payload, headers, config.cert, config.key);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(8000),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

function postWithCertificate(
  url: URL,
  payload: string,
  headers: Record<string, string>,
  cert: string,
  key: string,
): Promise<SmtResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers, cert, key, timeout: 8000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) as unknown : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('smt timeout')));
    req.end(payload);
  });
}

export async function requestNewAgreement(config: SmtConfig, meter: MeterRequest): Promise<{
  status: Exclude<SmtStatus, 'pending_setup'>;
  agreementNumber: string | null;
  transId: string;
  error: string | null;
}> {
  const transId = smtTransId();
  const response = await smtPost(config, SMT_PATHS.newAgreement, newAgreementBody(configCaller(config), meter, transId));
  const agreementNumber = readAgreementNumber(response.json);
  if (response.status >= 400 || !agreementNumber) {
    return {
      status: 'failed',
      agreementNumber,
      transId,
      error: readSmtError(response.json) ?? 'Smart Meter Texas did not accept the agreement request.',
    };
  }
  return { status: 'requested', agreementNumber, transId, error: null };
}

export async function requestAgreementStatus(config: SmtConfig, agreementNumber: string): Promise<{
  status: Exclude<SmtStatus, 'pending_setup'>;
  raw: string | null;
  error: string | null;
}> {
  const response = await smtPost(
    config,
    SMT_PATHS.agreements,
    agreementLookupBody(configCaller(config), agreementNumber, smtTransId()),
  );
  if (response.status >= 400) {
    return { status: 'requested', raw: null, error: readSmtError(response.json) ?? 'Smart Meter Texas did not return the agreement.' };
  }
  const raw = readAgreementStatusRaw(response.json);
  return { status: mapAgreementStatus(raw), raw, error: null };
}

export async function requestMonthlyUsage(config: SmtConfig, esiId: string, start: Date, end: Date): Promise<{
  rows: MonthlyUsage[];
  asyncDelivery: boolean;
  error: string | null;
}> {
  const response = await smtPost(config, SMT_PATHS.monthly, usageBody({
    caller: configCaller(config),
    esiId,
    start,
    end,
    transId: smtTransId(),
  }));
  if (response.status >= 400) {
    return { rows: [], asyncDelivery: false, error: readSmtError(response.json) ?? 'Monthly usage was not returned.' };
  }
  if (responseIsAsyncAck(response.json)) return { rows: [], asyncDelivery: true, error: null };
  return { rows: parseMonthlyUsage(response.json), asyncDelivery: false, error: null };
}

export async function requestIntervalUsage(config: SmtConfig, esiId: string, start: Date, end: Date): Promise<{
  rows: IntervalUsage[];
  asyncDelivery: boolean;
  error: string | null;
}> {
  const response = await smtPost(config, SMT_PATHS.intervals, usageBody({
    caller: configCaller(config),
    esiId,
    start,
    end,
    transId: smtTransId(),
  }));
  if (response.status >= 400) {
    return { rows: [], asyncDelivery: false, error: readSmtError(response.json) ?? 'Interval usage was not returned.' };
  }
  if (responseIsAsyncAck(response.json)) return { rows: [], asyncDelivery: true, error: null };
  return { rows: parseIntervalUsage(response.json), asyncDelivery: false, error: null };
}

function configCaller(config: SmtConfig) {
  return { requestorId: config.requestorId, duns: config.duns };
}
