import { confirmLightBill, startLightBillFromClaim, BookingDataError } from '../server/booking';
import { readServerEnv } from '../server/env';
import { assertMethod, notConfigured, readJson, sendJson, withErrors } from '../server/http';
import { createAdmin } from '../server/supabase';

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
  const record = body as { confirmToken?: unknown; claimToken?: unknown; lightBill?: unknown };
  const claimToken = typeof record.claimToken === 'string' ? record.claimToken : '';
  const token = typeof record.confirmToken === 'string' ? record.confirmToken : '';
  try {
    if (claimToken) {
      const started = await startLightBillFromClaim(createAdmin(env), claimToken, record.lightBill);
      if (!started.ok) {
        sendJson(res, started.status, { error: started.code, message: started.error });
        return;
      }
      sendJson(res, 200, { ok: true, upload: started.upload });
      return;
    }
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
