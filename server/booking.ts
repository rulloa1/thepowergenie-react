import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateCustomer, type CustomerDetails } from '../src/lib/bookingForm.js';
import {
  LIGHT_BILL_BUCKET,
  LIGHT_BILL_MAX_BYTES,
  acceptStoredBillMime,
  calendarEventDescription,
  isConfirmToken,
  isLightBillObjectPath,
  lightBillStoragePath,
  normalizeBillMime,
  validateLightBill,
  type BillUploadGrant,
  type LightBillMeta,
} from '../src/lib/lightBill.js';
import {
  HORIZON_DAYS,
  SLOT_DURATION_MS,
  generateOpenSlots,
  type BusyRange,
} from '../src/lib/slots.js';
import type { ServerEnv } from './env.js';
import { hubConsultRanges } from './hub-busy.js';
import { loadSlotRules } from './slot-rules.js';
import {
  CalendarCheckFailed,
  CalendarNotConnected,
  createGoogleEvent,
  deleteGoogleEvent,
  fetchGoogleBusy,
  updateGoogleEventDescription,
} from './google.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BookingDataError extends Error {
  constructor() {
    super('Booking data could not be read.');
    this.name = 'BookingDataError';
  }
}

export type BookSuccess = {
  ok: true;
  startsAt: string;
  endsAt: string;
  calendarSynced: boolean;
  upload: BillUploadGrant | null;
};

export type BookFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

type BusySnapshot = {
  ranges: BusyRange[];
  calendarConnected: boolean;
};

function asIso(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadDbBusy(admin: SupabaseClient, now: Date): Promise<BusyRange[]> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const { data, error } = await admin
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('status', 'confirmed')
    .lt('starts_at', horizon.toISOString())
    .gt('ends_at', now.toISOString());
  if (error) {
    console.error('load appointments failed', error.code);
    throw new BookingDataError();
  }
  const ranges: BusyRange[] = [];
  for (const row of data ?? []) {
    const record = row as { starts_at?: unknown; ends_at?: unknown };
    const start = asIso(record.starts_at);
    const end = asIso(record.ends_at);
    if (start && end) ranges.push({ start, end });
  }
  return ranges;
}

async function loadHubConsults(admin: SupabaseClient, now: Date): Promise<BusyRange[]> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const fromKey = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toKey = new Date(horizon.getTime() + 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let durationMs = 120 * 60 * 1000;
  try {
    durationMs = loadSlotRules().durationMinutes * 60 * 1000;
  } catch {
    durationMs = 120 * 60 * 1000;
  }
  const { data, error } = await admin
    .from('powergenie_customers')
    .select('appointment_date')
    .gte('appointment_date', fromKey)
    .lt('appointment_date', toKey)
    .limit(500);
  if (error) {
    console.error('load hub consults failed', error.code);
    return [];
  }
  return hubConsultRanges(
    (data ?? []).map((row) => (row as { appointment_date?: unknown }).appointment_date),
    durationMs,
    now,
    horizon,
  );
}

async function collectBusy(admin: SupabaseClient, env: ServerEnv, now: Date): Promise<BusySnapshot> {
  const dbRanges = await loadDbBusy(admin, now);
  const hubRanges = await loadHubConsults(admin, now);
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const google = await fetchGoogleBusy(admin, env, now, horizon);
  return {
    ranges: [...dbRanges, ...hubRanges, ...google.ranges],
    calendarConnected: google.connected,
  };
}

export async function listOpenSlots(admin: SupabaseClient, env: ServerEnv, now = new Date()) {
  const busy = await collectBusy(admin, env, now);
  return generateOpenSlots({ now, busy: busy.ranges }).map((slot) => slot.toISOString());
}

async function rememberSyncError(admin: SupabaseClient, id: string, message: string) {
  const { error } = await admin.from('appointments').update({ calendar_sync_error: message }).eq('id', id);
  if (error) console.error('store calendar sync error failed', error.code);
}

export async function bookSlot(
  admin: SupabaseClient,
  env: ServerEnv,
  input: {
    slot: string;
    customer: unknown;
    lightBill?: unknown;
    source: 'public' | 'dashboard';
    createdBy: string | null;
    now?: Date;
  },
): Promise<BookSuccess | BookFailure> {
  const now = input.now ?? new Date();
  const starts = asIso(input.slot);
  if (!starts) {
    return { ok: false, status: 400, code: 'invalid_slot', error: 'Pick an open time.' };
  }
  const customerResult = validateCustomer(input.customer);
  if (!customerResult.ok) {
    return { ok: false, status: 400, code: 'invalid_customer', error: customerResult.message };
  }
  const bill = readRequestedBill(input.source, input.lightBill);
  if (bill && 'ok' in bill) return bill;

  const busy = await collectBusy(admin, env, now);
  const open = generateOpenSlots({ now, busy: busy.ranges });
  if (!open.some((slot) => slot.getTime() === starts.getTime())) {
    return {
      ok: false,
      status: 409,
      code: 'slot_unavailable',
      error: 'That time is no longer open. Pick another slot.',
    };
  }

  const ends = new Date(starts.getTime() + SLOT_DURATION_MS);
  const customer: CustomerDetails = customerResult.value;
  const { data: inserted, error: insertError } = await admin
    .from('appointments')
    .insert({
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: 'confirmed',
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_email: customer.email,
      customer_address: customer.address,
      note: customer.note,
      created_by: input.createdBy,
      source: input.source,
      calendar_sync_error: busy.calendarConnected ? null : 'Google Calendar is not connected.',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    const code = insertError?.code ?? '';
    const message = insertError?.message ?? '';
    if (code === '23P01' || /appointments_no_overlap/i.test(message)) {
      return {
        ok: false,
        status: 409,
        code: 'slot_unavailable',
        error: 'That time is no longer open. Pick another slot.',
      };
    }
    console.error('appointment insert failed', code || 'unknown');
    return { ok: false, status: 500, code: 'save_failed', error: 'We could not save that booking. Please try again.' };
  }

  const id = (inserted as { id?: unknown }).id;
  if (typeof id !== 'string') {
    return { ok: false, status: 500, code: 'save_failed', error: 'We could not save that booking. Please try again.' };
  }

  let calendarSynced = false;
  if (busy.calendarConnected) {
    try {
      const eventId = await createGoogleEvent(admin, env, { customer, starts, ends, lightBillAttached: false });
      const { error: updateError } = await admin
        .from('appointments')
        .update({ google_event_id: eventId, calendar_sync_error: null })
        .eq('id', id);
      if (updateError) {
        console.error('store google event id failed', updateError.code);
        await rememberSyncError(admin, id, 'The calendar event was created but not linked.');
      } else {
        calendarSynced = true;
      }
    } catch (error) {
      console.error('create google event failed', error instanceof Error ? error.name : 'error');
      await rememberSyncError(admin, id, 'Could not add this call to Google Calendar.');
    }
  }

  const upload = bill ? await issueLightBillUpload(admin, id, bill) : null;

  return {
    ok: true,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    calendarSynced,
    upload,
  };
}

export async function cancelAppointment(
  admin: SupabaseClient,
  env: ServerEnv,
  id: string,
): Promise<{ ok: true } | BookFailure> {
  if (!UUID_RE.test(id)) {
    return { ok: false, status: 400, code: 'invalid_id', error: 'That appointment was not found.' };
  }
  const { data, error } = await admin
    .from('appointments')
    .select('id, status, google_event_id')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('load appointment failed', error.code);
    throw new BookingDataError();
  }
  const row = data as { status?: unknown; google_event_id?: unknown } | null;
  if (!row || (row.status !== 'confirmed' && row.status !== 'cancelled')) {
    return { ok: false, status: 404, code: 'not_found', error: 'That appointment was not found.' };
  }
  if (row.status === 'cancelled') return { ok: true };

  const eventId = typeof row.google_event_id === 'string' ? row.google_event_id : null;
  if (eventId) {
    try {
      await deleteGoogleEvent(admin, env, eventId);
    } catch (error) {
      if (error instanceof CalendarNotConnected) {
        return {
          ok: false,
          status: 503,
          code: 'calendar_unavailable',
          error: 'Connect Google Calendar again, then cancel so the event comes off the phone too.',
        };
      }
      if (error instanceof CalendarCheckFailed) {
        return {
          ok: false,
          status: 502,
          code: 'calendar_delete_failed',
          error: 'Could not remove the Google Calendar event. The appointment is still booked.',
        };
      }
      throw error;
    }
  }

  const { error: updateError } = await admin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'confirmed');
  if (updateError) {
    console.error('cancel appointment failed', updateError.code);
    return { ok: false, status: 500, code: 'save_failed', error: 'Could not cancel the appointment.' };
  }
  return { ok: true };
}

function readRequestedBill(
  source: 'public' | 'dashboard',
  lightBill: unknown,
): LightBillMeta | BookFailure | null {
  if (source !== 'public' || lightBill == null) return null;
  const result = validateLightBill(lightBill);
  if (!result.ok) {
    return { ok: false, status: 400, code: 'invalid_bill', error: result.message };
  }
  return result.value;
}

async function issueLightBillUpload(
  admin: SupabaseClient,
  appointmentId: string,
  bill: LightBillMeta,
): Promise<BillUploadGrant | null> {
  const path = lightBillStoragePath(bill.name, randomUUID());
  if (!path) return null;
  const signed = await admin.storage.from(LIGHT_BILL_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data?.signedUrl || !signed.data.token) {
    console.error('light bill upload url failed', signed.error?.statusCode ?? 'error');
    return null;
  }
  const confirmToken = randomBytes(32).toString('hex');
  const { error } = await admin
    .from('appointments')
    .update({
      light_bill_path: path,
      light_bill_name: bill.name,
      light_bill_mime: bill.mime,
      light_bill_size: bill.size,
      light_bill_upload_token: confirmToken,
      light_bill_uploaded_at: null,
    })
    .eq('id', appointmentId);
  if (error) {
    console.error('store light bill upload failed', error.code);
    return null;
  }
  return { signedUrl: signed.data.signedUrl, confirmToken };
}

type BillRow = {
  id: string;
  status: string;
  light_bill_path: string;
  light_bill_name: string;
  light_bill_mime: string | null;
  google_event_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  note: string | null;
};

function readBillRow(value: unknown): BillRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.status !== 'string') return null;
  if (typeof row.light_bill_path !== 'string' || typeof row.light_bill_name !== 'string') return null;
  if (typeof row.customer_name !== 'string' || typeof row.customer_phone !== 'string') return null;
  if (typeof row.customer_email !== 'string' || typeof row.customer_address !== 'string') return null;
  return {
    id: row.id,
    status: row.status,
    light_bill_path: row.light_bill_path,
    light_bill_name: row.light_bill_name,
    light_bill_mime: typeof row.light_bill_mime === 'string' ? row.light_bill_mime : null,
    google_event_id: typeof row.google_event_id === 'string' ? row.google_event_id : null,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    customer_address: row.customer_address,
    note: typeof row.note === 'string' ? row.note : null,
  };
}

function readByteSize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function preferredBillMime(contentType: string | null, declared: string | null): string | null {
  if (!contentType) return declared;
  const mime = normalizeBillMime(contentType);
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') return declared;
  return mime;
}

async function clearPendingBill(admin: SupabaseClient, appointmentId: string, path: string) {
  if (isLightBillObjectPath(path)) {
    const removed = await admin.storage.from(LIGHT_BILL_BUCKET).remove([path]);
    if (removed.error) console.error('remove rejected light bill failed', removed.error.statusCode ?? 'error');
  }
  const { error } = await admin
    .from('appointments')
    .update({
      light_bill_path: null,
      light_bill_name: null,
      light_bill_mime: null,
      light_bill_size: null,
      light_bill_upload_token: null,
      light_bill_uploaded_at: null,
    })
    .eq('id', appointmentId);
  if (error) console.error('clear light bill failed', error.code);
}

export async function confirmLightBill(
  admin: SupabaseClient,
  env: ServerEnv,
  confirmToken: string,
): Promise<{ ok: true } | BookFailure> {
  if (!isConfirmToken(confirmToken)) {
    return { ok: false, status: 400, code: 'invalid_token', error: 'That light bill upload was not found.' };
  }
  const { data, error } = await admin
    .from('appointments')
    .select('id, status, light_bill_path, light_bill_name, light_bill_mime, google_event_id, customer_name, customer_phone, customer_email, customer_address, note')
    .eq('light_bill_upload_token', confirmToken)
    .maybeSingle();
  if (error) {
    console.error('load light bill failed', error.code);
    throw new BookingDataError();
  }
  const row = readBillRow(data);
  if (!row || !isLightBillObjectPath(row.light_bill_path)) {
    return { ok: false, status: 404, code: 'bill_not_found', error: 'That light bill upload was not found.' };
  }
  if (row.status !== 'confirmed') {
    return { ok: false, status: 409, code: 'bill_closed', error: 'That appointment is no longer booked, so the bill was not saved.' };
  }

  const info = await admin.storage.from(LIGHT_BILL_BUCKET).info(row.light_bill_path);
  if (info.error || !info.data) {
    return {
      ok: false,
      status: 409,
      code: 'bill_missing',
      error: 'The light bill has not arrived yet. Try the upload again.',
    };
  }
  const infoRecord = info.data as {
    size?: unknown;
    contentType?: unknown;
    content_type?: unknown;
    metadata?: { size?: unknown };
  };
  const size = readByteSize(infoRecord.size) ?? readByteSize(infoRecord.metadata?.size);
  const contentType = typeof infoRecord.contentType === 'string'
    ? infoRecord.contentType
    : typeof infoRecord.content_type === 'string'
      ? infoRecord.content_type
      : null;
  if (size == null || size <= 0) {
    return {
      ok: false,
      status: 409,
      code: 'bill_missing',
      error: 'The light bill has not arrived yet. Try the upload again.',
    };
  }
  if (size > LIGHT_BILL_MAX_BYTES || !acceptStoredBillMime(contentType)) {
    await clearPendingBill(admin, row.id, row.light_bill_path);
    return {
      ok: false,
      status: 400,
      code: 'bill_rejected',
      error: 'That file cannot be used as a light bill. The call is still booked.',
    };
  }

  const uploadedAt = new Date().toISOString();
  const { data: saved, error: saveError } = await admin
    .from('appointments')
    .update({
      light_bill_size: size,
      light_bill_uploaded_at: uploadedAt,
      light_bill_upload_token: null,
      light_bill_mime: preferredBillMime(contentType, row.light_bill_mime),
    })
    .eq('id', row.id)
    .eq('light_bill_upload_token', confirmToken)
    .select('id')
    .maybeSingle();
  if (saveError) {
    console.error('save light bill failed', saveError.code);
    return { ok: false, status: 500, code: 'save_failed', error: 'The light bill could not be saved. The call is still booked.' };
  }
  if (!saved) return { ok: true };

  if (row.google_event_id) {
    const customerResult = validateCustomer({
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
      address: row.customer_address,
      note: row.note ?? '',
    });
    if (customerResult.ok) {
      try {
        await updateGoogleEventDescription(
          admin,
          env,
          row.google_event_id,
          calendarEventDescription({
            customer: customerResult.value,
            lightBillAttached: true,
            site: env.publicSiteUrl,
          }),
        );
      } catch (calendarError) {
        console.error('light bill calendar note failed', calendarError instanceof Error ? calendarError.name : 'error');
      }
    }
  }
  return { ok: true };
}

export async function signedLightBillDownload(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: true; url: string } | BookFailure> {
  if (!UUID_RE.test(appointmentId)) {
    return { ok: false, status: 404, code: 'not_found', error: 'That light bill was not found.' };
  }
  const { data, error } = await admin
    .from('appointments')
    .select('light_bill_path, light_bill_uploaded_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) {
    console.error('load light bill download failed', error.code);
    throw new BookingDataError();
  }
  const row = data as { light_bill_path?: unknown; light_bill_name?: unknown; light_bill_uploaded_at?: unknown } | null;
  const path = row && typeof row.light_bill_path === 'string' ? row.light_bill_path : '';
  if (!row || typeof row.light_bill_uploaded_at !== 'string' || !isLightBillObjectPath(path)) {
    return { ok: false, status: 404, code: 'not_found', error: 'That light bill was not found.' };
  }
  const signed = await admin.storage.from(LIGHT_BILL_BUCKET).createSignedUrl(path, 120);
  if (signed.error || !signed.data?.signedUrl) {
    console.error('light bill download url failed', signed.error?.statusCode ?? 'error');
    return { ok: false, status: 500, code: 'save_failed', error: 'The light bill could not be opened. Try again.' };
  }
  return { ok: true, url: signed.data.signedUrl };
}
