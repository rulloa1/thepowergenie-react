import { toPublicBookBody } from '../src/lib/lightBill.js';
import { bookSlot, BookingDataError } from '../server/booking.js';
import { readServerEnv } from '../server/env.js';
import { assertMethod, notConfigured, readJson, sendJson, withErrors } from '../server/http.js';
import { CalendarCheckFailed } from '../server/google.js';
import { createAdmin } from '../server/supabase.js';

export default withErrors(async (req, res) => {
  if (!assertMethod(req, res, 'POST')) return;
  const env = readServerEnv();
  if (!env) {
    notConfigured(res);
    return;
  }
  const body = readJson(req);
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_json', message: 'The booking form was empty.' });
    return;
  }
  const record = body as Record<string, unknown>;
  const slot = typeof record.slot === 'string' ? record.slot : '';
  try {
    const result = await bookSlot(createAdmin(env), env, {
      slot,
      customer: record,
      lightBill: record.lightBill,
      source: 'public',
      createdBy: null,
    });
    if (!result.ok) {
      sendJson(res, result.status, { error: result.code, message: result.error });
      return;
    }
    sendJson(res, 200, toPublicBookBody(result));
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      sendJson(res, 503, {
        error: 'calendar_unavailable',
        message: "We couldn't confirm the calendar. Please try again in a moment.",
      });
      return;
    }
    if (error instanceof BookingDataError) {
      sendJson(res, 500, {
        error: 'server_error',
        message: 'We could not save that booking. Please try again.',
      });
      return;
    }
    throw error;
  }
});
