import { readServerEnv, googleReady } from '../../server/env';
import { bearerToken, notConfigured, sendJson, assertMethod, withErrors } from '../../server/http';
import { buildGoogleAuthUrl, createOauthState, CalendarCheckFailed } from '../../server/google';
import { createAdmin, requireDashboardUser } from '../../server/supabase';

export default withErrors(async (req, res) => {
  if (!assertMethod(req, res, 'GET')) return;
  const env = readServerEnv();
  if (!env) {
    notConfigured(res);
    return;
  }
  if (!googleReady(env)) {
    sendJson(res, 503, {
      error: 'not_configured',
      message: 'Google Calendar keys are not configured yet.',
    });
    return;
  }
  const admin = createAdmin(env);
  const auth = await requireDashboardUser(admin, bearerToken(req));
  if ('error' in auth) {
    sendJson(res, auth.error.status, { error: 'unauthorized', message: auth.error.message });
    return;
  }
  try {
    const state = await createOauthState(admin, auth.profile.id);
    sendJson(res, 200, { url: buildGoogleAuthUrl(env, state) });
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      sendJson(res, 503, { error: 'calendar_unavailable', message: 'Could not start the Google connection.' });
      return;
    }
    throw error;
  }
});
