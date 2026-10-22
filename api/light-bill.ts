import { signedLightBillDownload, BookingDataError } from '../server/booking.js';
import { readServerEnv } from '../server/env.js';
import { assertMethod, bearerToken, notConfigured, queryValue, sendJson, withErrors } from '../server/http.js';
import { createAdmin, requireDashboardUser } from '../server/supabase.js';

export default withErrors(async (req, res) => {
  if (!assertMethod(req, res, 'GET')) return;
  const env = readServerEnv();
  if (!env) {
    notConfigured(res);
    return;
  }
  const admin = createAdmin(env);
  const auth = await requireDashboardUser(admin, bearerToken(req));
  if ('error' in auth) {
    sendJson(res, auth.error.status, { error: 'unauthorized', message: auth.error.message });
    return;
  }
  const appointmentId = queryValue(req.query.appointmentId) ?? '';
  try {
    const result = await signedLightBillDownload(admin, appointmentId);
    if (!result.ok) {
      sendJson(res, result.status, { error: result.code, message: result.error });
      return;
    }
    sendJson(res, 200, { url: result.url });
  } catch (error) {
    if (error instanceof BookingDataError) {
      sendJson(res, 500, { error: 'server_error', message: 'The light bill could not be opened. Try again.' });
      return;
    }
    throw error;
  }
});
