import type { SupabaseClient } from '@supabase/supabase-js';
import { METER_CONSENT_TEXT, type MeterRequest } from '../../src/lib/esiId';
import type { SmtStatus } from '../../src/lib/smt';
import { requestAgreementStatus, requestIntervalUsage, requestMonthlyUsage, requestNewAgreement } from './client';
import { readSmtConfig } from './config';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveMeterAuthorization(
  admin: SupabaseClient,
  appointmentId: string,
  meter: MeterRequest,
): Promise<SmtStatus> {
  const config = readSmtConfig();
  const initial: SmtStatus = config ? 'requested' : 'pending_setup';
  const { data, error } = await admin
    .from('smt_authorizations')
    .insert({
      appointment_id: appointmentId,
      esi_id: meter.esiId,
      meter_number: meter.meterNumber,
      customer_email: meter.email,
      consent_at: new Date().toISOString(),
      consent_text: METER_CONSENT_TEXT,
      status: initial,
    })
    .select('id')
    .single();
  if (error || !data || typeof (data as { id?: unknown }).id !== 'string') {
    console.error('save meter authorization failed', error?.code ?? 'unknown');
    return 'failed';
  }
  const id = (data as { id: string }).id;
  if (!config) return 'pending_setup';
  try {
    const created = await requestNewAgreement(config, meter);
    const { error: updateError } = await admin.from('smt_authorizations').update({
      status: created.status,
      smt_agreement_number: created.agreementNumber,
      smt_trans_id: created.transId,
      last_error: created.error,
      last_checked_at: new Date().toISOString(),
    }).eq('id', id);
    if (updateError) console.error('update meter authorization failed', updateError.code);
    return created.status;
  } catch (error) {
    console.error('smt agreement failed', error instanceof Error ? error.name : 'error');
    await admin.from('smt_authorizations').update({
      status: 'failed',
      last_error: 'Smart Meter Texas could not be reached.',
      last_checked_at: new Date().toISOString(),
    }).eq('id', id);
    return 'failed';
  }
}

type AuthRow = {
  id: string;
  status: string;
  esi_id: string;
  smt_agreement_number: string | null;
  interval_cursor: string | null;
};

export async function refreshSmtAuthorizations(admin: SupabaseClient): Promise<{ checked: number }> {
  const config = readSmtConfig();
  if (!config) return { checked: 0 };
  const { data, error } = await admin
    .from('smt_authorizations')
    .select('id, status, esi_id, smt_agreement_number, interval_cursor')
    .in('status', ['requested', 'approved'])
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(3);
  if (error) {
    console.error('list smt authorizations failed', error.code);
    return { checked: 0 };
  }
  let checked = 0;
  for (const item of data ?? []) {
    const row = readAuthRow(item);
    if (!row) continue;
    checked += 1;
    await refreshOne(admin, config, row);
  }
  return { checked };
}

async function refreshOne(admin: SupabaseClient, config: NonNullable<ReturnType<typeof readSmtConfig>>, row: AuthRow) {
  let status = row.status === 'approved' ? 'approved' : 'requested';
  let note: string | null = null;
  try {
    if (row.smt_agreement_number) {
      const lookedUp = await requestAgreementStatus(config, row.smt_agreement_number);
      status = lookedUp.status;
      if (lookedUp.error) note = lookedUp.error;
    }
    if (status === 'approved') {
      const end = new Date();
      const start = new Date(end.getTime() - 365 * DAY_MS);
      const monthly = await requestMonthlyUsage(config, row.esi_id, start, end);
      if (monthly.error) note = monthly.error;
      else if (monthly.asyncDelivery) {
        note = 'Smart Meter Texas accepted the usage request but did not return JSON. The public guide says that response is delivered by email.';
      } else if (monthly.rows.length > 0) {
        const { error } = await admin.from('smt_usage_monthly').upsert(
          monthly.rows.map((item) => ({
            authorization_id: row.id,
            esi_id: row.esi_id,
            period_start: item.periodStart,
            period_end: item.periodEnd,
            kwh: item.kwh,
          })),
          { onConflict: 'authorization_id,period_start,period_end' },
        );
        if (error) console.error('save monthly usage failed', error.code);
      }
      const cursor = row.interval_cursor ? new Date(`${row.interval_cursor}T12:00:00.000Z`) : start;
      const intervalEnd = new Date(Math.min(end.getTime(), cursor.getTime() + 7 * DAY_MS));
      if (cursor.getTime() < end.getTime()) {
        const intervals = await requestIntervalUsage(config, row.esi_id, cursor, intervalEnd);
        if (intervals.error) note = intervals.error;
        else if (intervals.asyncDelivery && !note) {
          note = 'Smart Meter Texas accepted the 15-minute request but did not return JSON.';
        } else if (intervals.rows.length > 0) {
          const { error } = await admin.from('smt_usage_intervals').upsert(
            intervals.rows.map((item) => ({
              authorization_id: row.id,
              esi_id: row.esi_id,
              interval_start: item.intervalStart,
              kwh: item.kwh,
              quality: item.quality,
            })),
            { onConflict: 'authorization_id,interval_start' },
          );
          if (error) console.error('save interval usage failed', error.code);
        }
        await admin.from('smt_authorizations').update({
          interval_cursor: intervalEnd.toISOString().slice(0, 10),
        }).eq('id', row.id);
      }
    }
  } catch (error) {
    console.error('smt refresh failed', error instanceof Error ? error.name : 'error');
    note = 'Smart Meter Texas could not be reached.';
  }
  await admin.from('smt_authorizations').update({
    status,
    sync_note: note,
    last_error: note,
    last_checked_at: new Date().toISOString(),
  }).eq('id', row.id);
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
  };
}
