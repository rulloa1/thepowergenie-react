import type { VercelRequest } from '@vercel/node';
import { composePublicBook } from '../src/lib/publicBook';
import { allowRate, clientRateKey, type RateBucket } from '../src/lib/rateLimit';
import { assistantEnabled, runAssistant } from '../server/assistant';
import { readServerEnv } from '../server/env';
import { assertMethod, notConfigured, readJson, sendJson, withErrors } from '../server/http';
import { createAdmin } from '../server/supabase';

const bucket: RateBucket = new Map();
const LIMIT = 15;
const WINDOW_MS = 10 * 60 * 1000;

function callerKey(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  return clientRateKey(typeof forwarded === 'string' || Array.isArray(forwarded) ? forwarded : undefined);
}

export default withErrors(async (req, res) => {
  if (req.method === 'GET') {
    sendJson(res, 200, { enabled: assistantEnabled() });
    return;
  }
  if (!assertMethod(req, res, 'POST')) return;
  if (!allowRate(bucket, callerKey(req), Date.now(), LIMIT, WINDOW_MS)) {
    sendJson(res, 429, { message: 'Too many messages. Wait a few minutes, or use the form.' });
    return;
  }
  if (!assistantEnabled()) {
    sendJson(res, 200, {
      message: 'The assistant is not turned on. You can still book with the form.',
      booking: null,
    });
    return;
  }
  const env = readServerEnv();
  if (!env) {
    notConfigured(res);
    return;
  }
  const body = readJson(req);
  const messages = body && typeof body === 'object' ? (body as { messages?: unknown }).messages : null;
  const result = await runAssistant(createAdmin(env), env, messages);
  if (!result.ok) {
    sendJson(res, result.status, { message: result.message, booking: null });
    return;
  }
  sendJson(res, 200, {
    message: result.message,
    booking: result.booking ? composePublicBook(result.booking) : null,
  });
});
