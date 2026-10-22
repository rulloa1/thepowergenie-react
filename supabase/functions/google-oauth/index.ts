// Google Calendar connection for the owner.
//
//   POST { action: 'start' }  (signed-in owner) → { url } to send the browser to Google
//   GET  ?code=…&state=…      Google's redirect back here; stores the refresh token
//                             server-side, then redirects to /dashboard?tab=schedule
//
// Register this function's URL as the OAuth redirect URI in Google Cloud:
//   https://<project-ref>.supabase.co/functions/v1/google-oauth

import { adminClient, hubUser } from '../_shared/db.ts';
import { fail, json, notConfigured, preflight, siteUrl } from '../_shared/http.ts';
import { authUrl, exchangeCode, googleConfigured, signState, verifyState } from '../_shared/google.ts';

function backToDashboard(params: Record<string, string>) {
  const url = new URL(`${siteUrl()}/dashboard`);
  url.searchParams.set('tab', 'schedule');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const admin = adminClient();
  if (!admin) return notConfigured(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!googleConfigured()) {
    return req.method === 'GET'
      ? backToDashboard({ google: 'not_configured' })
      : notConfigured(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  }

  if (req.method === 'POST') {
    const user = await hubUser(admin, req);
    if (!user) return fail(401, 'unauthorized', 'Please sign in to the dashboard.');
    if (user.role !== 'owner') return fail(403, 'forbidden', 'Only the owner can connect Google Calendar.');
    return json({ url: authUrl(await signState(user.id)) });
  }

  if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Method not allowed.');

  const params = new URL(req.url).searchParams;
  if (params.get('error')) return backToDashboard({ google: 'denied' });

  const userId = await verifyState(params.get('state') || '');
  const code = params.get('code');
  if (!userId || !code) return backToDashboard({ google: 'expired' });

  // The state was signed for a specific owner; make sure they still are one.
  const { data: profile } = await admin.from('hub_profiles').select('role').eq('id', userId).maybeSingle();
  if (profile?.role !== 'owner') return backToDashboard({ google: 'forbidden' });

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refreshToken) {
      console.error('[google-oauth] no refresh token returned');
      return backToDashboard({ google: 'no_refresh_token' });
    }
    const granted = tokens.scope || '';
    if (!granted.includes('calendar.events') || !granted.includes('calendar.freebusy')) {
      return backToDashboard({ google: 'missing_scope' });
    }
    const { error } = await admin.from('hub_google_credentials').upsert({
      id: 1,
      connected_by: userId,
      google_email: tokens.email,
      calendar_id: 'primary',
      refresh_token: tokens.refreshToken,
      scope: granted,
      connected_at: new Date().toISOString(),
    });
    if (error) throw error;
    return backToDashboard({ google: 'connected' });
  } catch (e) {
    console.error('[google-oauth]', e);
    return backToDashboard({ google: 'error' });
  }
});
