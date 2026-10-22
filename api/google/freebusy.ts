import { readServerEnv } from '../../server/env.js';
import { assertMethod, bearerToken, notConfigured, queryValue, sendJson, withErrors } from '../../server/http.js';
import { fetchGoogleBusy, CalendarCheckFailed } from '../../server/google.js';
import { HORIZON_DAYS } from '../../src/lib/slots.js';
import { createAdmin, requireDashboardUser } from '../../server/supabase.js';

const MAX_WINDOW_MS = 62 * 24 * 60 * 60 * 1000;

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

  const now = new Date();
  const timeMin = parseBound(queryValue(req.query.timeMin), now);
  const timeMax = parseBound(
    queryValue(req.query.timeMax),
    new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000),
  );
  if (!timeMin || !timeMax || timeMax.getTime() <= timeMin.getTime()) {
    sendJson(res, 400, { error: 'invalid_range', message: 'That date range is not valid.' });
    return;
  }
  if (timeMax.getTime() - timeMin.getTime() > MAX_WINDOW_MS) {
    sendJson(res, 400, { error: 'invalid_range', message: 'That date range is too long.' });
    return;
  }

  try {
    const result = await fetchGoogleBusy(admin, env, timeMin, timeMax);
    sendJson(res, 200, {
      connected: result.connected,
      busy: result.ranges.map((range) => ({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      sendJson(res, 503, {
        error: 'calendar_unavailable',
        message: 'Google Calendar could not be checked. Use Connect Google Calendar if this keeps happening.',
      });
      return;
    }
    throw error;
  }
});

function parseBound(value: string | null, fallback: Date): Date | null {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
