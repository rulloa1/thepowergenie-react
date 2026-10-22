import { readServerEnv, googleReady, siteOrigin } from '../../server/env';
import { queryValue, withErrors } from '../../server/http';
import { consumeOauthState, exchangeCode, saveRefreshToken, CalendarCheckFailed } from '../../server/google';
import { createAdmin } from '../../server/supabase';
import type { VercelResponse } from '@vercel/node';

function redirectDashboard(res: VercelResponse, origin: string, query: string) {
  res.redirect(302, `${origin}/dashboard?${query}`);
}

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('That action is not available.');
    return;
  }
  const env = readServerEnv();
  const origin = siteOrigin(env?.publicSiteUrl ?? null);
  if (!env || !origin || !googleReady(env)) {
    res.status(503).send('Google Calendar is not configured yet.');
    return;
  }
  const oauthError = queryValue(req.query.error);
  const code = queryValue(req.query.code);
  const state = queryValue(req.query.state);
  if (oauthError || !code || !state) {
    redirectDashboard(res, origin, 'calendar=error');
    return;
  }
  const admin = createAdmin(env);
  try {
    const userId = await consumeOauthState(admin, state);
    if (!userId) {
      redirectDashboard(res, origin, 'calendar=error');
      return;
    }
    const tokens = await exchangeCode(env, code);
    await saveRefreshToken(admin, tokens, userId);
    redirectDashboard(res, origin, 'calendar=connected');
  } catch (error) {
    if (error instanceof CalendarCheckFailed) {
      redirectDashboard(res, origin, 'calendar=error');
      return;
    }
    throw error;
  }
});
