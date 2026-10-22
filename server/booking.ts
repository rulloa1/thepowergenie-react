import type { SupabaseClient } from '@supabase/supabase-js';
import { validateCustomer, type CustomerDetails } from '../src/lib/bookingForm';
import {
  HORIZON_DAYS,
  SLOT_DURATION_MS,
  generateOpenSlots,
  type BusyRange,
} from '../src/lib/slots';
import type { ServerEnv } from './env';
import {
  CalendarCheckFailed,
  CalendarNotConnected,
  createGoogleEvent,
  deleteGoogleEvent,
  fetchGoogleBusy,
} from './google';

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

async function collectBusy(admin: SupabaseClient, env: ServerEnv, now: Date): Promise<BusySnapshot> {
  const dbRanges = await loadDbBusy(admin, now);
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const google = await fetchGoogleBusy(admin, env, now, horizon);
  return {
    ranges: [...dbRanges, ...google.ranges],
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
      const eventId = await createGoogleEvent(admin, env, { customer, starts, ends });
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

  return {
    ok: true,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    calendarSynced,
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
