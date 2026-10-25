import type { MeterRequest } from '../../src/lib/esiId';
import { supabaseConfig, supabaseFetch } from '../supabase.js';
import { requestAgreementStatus, requestIntervalUsage, requestMonthlyUsage, requestNewAgreement } from './client';
import { readSmtConfig, type SmtConfig } from './config';

const DAY_MS = 24 * 60 * 60 * 1000;

type RestResult = { ok: boolean; status: number; json: unknown };

async function rest(path: string, init: RequestInit = {}): Promise<RestResult> {
  try {
    supabaseConfig();
  } catch {
    return { ok: false, status: 503, json: null };
  }
  const response = await supabaseFetch(path, init);
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  return { ok: response.ok, status: response.status, json };
}

async function patchAuthorization(id: string, row: Record<string, unknown>): Promise<boolean> {
  const result = await rest(`/rest/v1/smt_authorizations?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!result.ok) console.error('update meter authorization failed', result.status);
  return result.ok;
}

async function upsertRows(table: string, conflict: string, rows: Record<string, unknown>[]): Promise<boolean> {
  const result = await rest(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!result.ok) console.error(`save ${table} failed`, result.status);
  return result.ok;
}

type AuthRow = {
  id: string;
  status: string;
  esi_id: string;
  smt_agreement_number: string | null;
  interval_cursor: string | null;
  meter_number: string | null;
  customer_email: string | null;
};

export async function refreshSmtAuthorizations(): Promise<{ checked: number }> {
  const config = readSmtConfig();
  if (!config) return { checked: 0 };
  const params = new URLSearchParams({
    select: 'id,status,esi_id,smt_agreement_number,interval_cursor,meter_number,customer_email',
    order: 'last_checked_at.asc.nullsfirst',
    limit: '3',
  });
  params.append('status', 'in.(pending_setup,requested,approved)');
  const listed = await rest(`/rest/v1/smt_authorizations?${params.toString()}`);
  if (!listed.ok || !Array.isArray(listed.json)) {
    console.error('list smt authorizations failed', listed.status);
    return { checked: 0 };
  }
  let checked = 0;
  for (const item of listed.json) {
    const row = readAuthRow(item);
    if (!row) continue;
    checked += 1;
    await refreshOne(config, row);
  }
  return { checked };
}

async function refreshOne(config: SmtConfig, row: AuthRow) {
  let status = row.status === 'approved' ? 'approved' : 'requested';
  let note: string | null = null;
  try {
    if (row.status === 'pending_setup' || (!row.smt_agreement_number && status !== 'approved')) {
      if (!row.meter_number || !row.customer_email) {
        note = 'Missing meter number or email for agreement request.';
      } else {
        const meter: MeterRequest = {
          esiId: row.esi_id,
          meterNumber: row.meter_number,
          email: row.customer_email,
          consent: true,
        };
        const created = await requestNewAgreement(config, meter);
        await patchAuthorization(row.id, {
          status: created.status,
          smt_agreement_number: created.agreementNumber,
          smt_trans_id: created.transId,
        });
        status = created.status;
        if (created.error) note = created.error;
      }
    }
    if (row.smt_agreement_number && status !== 'pending_setup') {
      const lookedUp = await requestAgreementStatus(config, row.smt_agreement_number);
      if (lookedUp.error) note = lookedUp.error;
      else status = lookedUp.status;
    }
    if (status === 'approved') {
      const end = new Date();
      const start = new Date(end.getTime() - 365 * DAY_MS);
      const monthly = await requestMonthlyUsage(config, row.esi_id, start, end);
      if (monthly.error) note = monthly.error;
      else if (monthly.asyncDelivery) {
        note = 'Smart Meter Texas accepted the usage request but did not return JSON. The public guide says that response is delivered by email.';
      } else if (monthly.rows.length > 0) {
        await upsertRows(
          'smt_usage_monthly',
          'authorization_id,period_start,period_end',
          monthly.rows.map((item) => ({
            authorization_id: row.id,
            esi_id: row.esi_id,
            period_start: item.periodStart,
            period_end: item.periodEnd,
            kwh: item.kwh,
          })),
        );
      }
      const cursor = row.interval_cursor ? new Date(`${row.interval_cursor}T12:00:00.000Z`) : start;
      const intervalEnd = new Date(Math.min(end.getTime(), cursor.getTime() + 7 * DAY_MS));
      if (cursor.getTime() < end.getTime()) {
        const intervals = await requestIntervalUsage(config, row.esi_id, cursor, intervalEnd);
        if (intervals.error) note = intervals.error;
        else if (intervals.asyncDelivery && !note) {
          note = 'Smart Meter Texas accepted the 15-minute request but did not return JSON.';
        } else if (intervals.rows.length > 0) {
          const saved = await upsertRows(
            'smt_usage_intervals',
            'authorization_id,interval_start',
            intervals.rows.map((item) => ({
              authorization_id: row.id,
              esi_id: row.esi_id,
              interval_start: item.intervalStart,
              kwh: item.kwh,
              quality: item.quality,
            })),
          );
          if (saved) {
            await patchAuthorization(row.id, { interval_cursor: intervalEnd.toISOString().slice(0, 10) });
          }
        }
      }
    }
  } catch (error) {
    console.error('smt refresh failed', error instanceof Error ? error.name : 'error');
    note = 'Smart Meter Texas could not be reached.';
  }
  await patchAuthorization(row.id, {
    status,
    sync_note: note,
    last_error: note,
    last_checked_at: new Date().toISOString(),
  });
}

function readAuthRow(value: unknown): AuthRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.esi_id !== 'string') return null;
  return {
    id: row.id,
    status: typeof row.status === 'string' ? row.status : 'requested',
    esi_id: row.esi_id,
    smt_agreement_number: typeof row.smt_agreement_number === 'string' ? row.smt_agreement_number : null,
    interval_cursor: typeof row.interval_cursor === 'string' ? row.interval_cursor : null,
    meter_number: typeof row.meter_number === 'string' ? row.meter_number : null,
    customer_email: typeof row.customer_email === 'string' ? row.customer_email : null,
  };
}
