import { listOpenSlots, BookingDataError } from '../server/booking.js';
import { readServerEnv } from '../server/env.js';
import { notConfigured, sendJson, assertMethod, withErrors } from '../server/http.js';
import { CalendarCheckFailed } from '../server/google.js';
import { createAdmin } from '../server/supabase.js';

export default withErrors(async (req, res) => {
  if (!assertMethod(req, res, 'GET')) return;
  const env = readServerEnv();
  if (!env) {
    notConfigured(res);
    return;
  }
  try {
    const slots = await listOpenSlots(createAdmin(env), env);
    sendJson(res, 200, { slots });
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      sendJson(res, 503, {
        error: 'calendar_unavailable',
        message: "Open times can't be loaded right now. Please try again in a moment.",
      });
      return;
    }
    if (error instanceof BookingDataError) {
      sendJson(res, 500, {
        error: 'server_error',
        message: "Open times can't be loaded right now. Please try again in a moment.",
      });
      return;
    }
    throw error;
  }
});
