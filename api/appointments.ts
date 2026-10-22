import { bookSlot, cancelAppointment, BookingDataError } from '../server/booking';
import { readServerEnv } from '../server/env';
import { bearerToken, notConfigured, readJson, sendJson, withErrors } from '../server/http';
import { CalendarCheckFailed } from '../server/google';
import { createAdmin, requireDashboardUser } from '../server/supabase';

async function authorized(req: Parameters<typeof bearerToken>[0], res: Parameters<typeof sendJson>[0]) {
  const env = readServerEnv();
  if (!env) {
    notConfigured(res);
    return null;
  }
  const admin = createAdmin(env);
  const auth = await requireDashboardUser(admin, bearerToken(req));
  if ('error' in auth) {
    sendJson(res, auth.error.status, { error: 'unauthorized', message: auth.error.message });
    return null;
  }
  return { env, admin, profile: auth.profile };
}

export default withErrors(async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    sendJson(res, 405, { error: 'method_not_allowed', message: 'That action is not available.' });
    return;
  }
  const gate = await authorized(req, res);
  if (!gate) return;
  const body = readJson(req);
  if (!body || typeof body !== 'object') {
    sendJson(res, 400, { error: 'invalid_json', message: 'The form was empty.' });
    return;
  }
  const record = body as Record<string, unknown>;

  try {
    if (req.method === 'DELETE') {
      const id = typeof record.id === 'string' ? record.id : '';
      const result = await cancelAppointment(gate.admin, gate.env, id);
      if (!result.ok) {
        sendJson(res, result.status, { error: result.code, message: result.error });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const slot = typeof record.slot === 'string' ? record.slot : '';
    const result = await bookSlot(gate.admin, gate.env, {
      slot,
      customer: record,
      source: 'dashboard',
      createdBy: gate.profile.id,
    });
    if (!result.ok) {
      sendJson(res, result.status, { error: result.code, message: result.error });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      calendarSynced: result.calendarSynced,
    });
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      sendJson(res, 503, {
        error: 'calendar_unavailable',
        message: "Couldn't check Google Calendar. Nothing was changed.",
      });
      return;
    }
    if (error instanceof BookingDataError) {
      sendJson(res, 500, { error: 'server_error', message: 'Something went wrong. Please try again.' });
      return;
    }
    throw error;
  }
});
