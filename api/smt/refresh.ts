import { bearerToken, sendJson, withErrors } from '../../server/http';
import { readServerEnv } from '../../server/env';
import { refreshSmtAuthorizations } from '../../server/smt/store';
import { createAdmin } from '../../server/supabase';

export default withErrors(async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'method_not_allowed', message: 'That action is not available.' });
    return;
  }
  const secret = process.env.CRON_SECRET?.trim();
  const token = bearerToken(req);
  if (!secret || !token || token !== secret) {
    sendJson(res, 401, { error: 'unauthorized', message: 'That action is not available.' });
    return;
  }
  const env = readServerEnv();
  if (!env) {
    sendJson(res, 200, { ok: true, checked: 0 });
    return;
  }
  const result = await refreshSmtAuthorizations(createAdmin(env));
  sendJson(res, 200, { ok: true, checked: result.checked });
});
