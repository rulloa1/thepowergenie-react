import { confirmLightBill, BookingDataError } from '../server/booking.js';
import { readServerEnv } from '../server/env.js';
import { assertMethod, notConfigured, readJson, sendJson, withErrors } from '../server/http.js';
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
    sendJson(res, 400, { error: 'invalid_json', message: 'The upload confirmation was empty.' });
    return;
  }
  const token = typeof (body as { confirmToken?: unknown }).confirmToken === 'string'
    ? (body as { confirmToken: string }).confirmToken
    : '';
  try {
    const result = await confirmLightBill(createAdmin(env), env, token);
    if (!result.ok) {
      sendJson(res, result.status, { error: result.code, message: result.error });
      return;
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof BookingDataError) {
      sendJson(res, 500, {
        error: 'server_error',
        message: 'The light bill could not be saved. The call is still booked.',
      });
      return;
    }
    throw error;
  }
});
