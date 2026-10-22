import { readServerEnv } from '../../server/env';
import { assertMethod, bearerToken, notConfigured, sendJson, withErrors } from '../../server/http';
import { connectionStatus, CalendarCheckFailed } from '../../server/google';
import { createAdmin, requireDashboardUser } from '../../server/supabase';

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
  try {
    const status = await connectionStatus(admin);
    sendJson(res, 200, status);
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      sendJson(res, 503, { error: 'calendar_unavailable', message: 'Could not read the calendar connection.' });
      return;
    }
    throw error;
  }
});
