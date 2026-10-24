// Google Calendar connection for each Referral Hub member.
//
//   POST { action: 'start' }  (signed-in hub member) → { url } to send the browser to Google
//   GET  ?code=…&state=…      Google's redirect back here; stores that member's refresh
//                             token, then redirects to /dashboard?tab=schedule
//
// The redirect URI registered on the Google OAuth client must be exactly redirectUri()
// (GOOGLE_REDIRECT_URI, or https://<project-ref>.supabase.co/functions/v1/google-oauth).

import { adminClient, hubUser, type Admin } from '../_shared/db.ts';
import { env, fail, json, notConfigured, preflight } from '../_shared/http.ts';
import { authUrl, exchangeCode, googleConfigured, signState, verifyState } from '../_shared/google.ts';
import { siteOrigin } from '../_shared/notify.ts';

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') return true;
  const message = (error.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('schema cache');
}

/** Store this member's refresh token. Owner falls back to the legacy single row. */
async function saveRefreshToken(
  admin: Admin,
  userId: string,
  role: string,
  tokens: { email: string | null; refreshToken: string; scope: string },
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await admin.from('hub_google_accounts').upsert({
    user_id: userId,
    google_email: tokens.email,
    calendar_id: 'primary',
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
    connected_at: now,
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (!error) return true;
  if (!missingRelation(error)) throw error;
  if (role !== 'owner') {
    console.error('[google-oauth] hub_google_accounts is missing; apply the member calendar migration');
    return false;
  }
  const { error: legacyError } = await admin.from('hub_google_credentials').upsert({
    id: 1,
    connected_by: userId,
    google_email: tokens.email,
    calendar_id: 'primary',
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
    connected_at: now,
  });
  if (legacyError) throw legacyError;
  return true;
}

function backToDashboard(params: Record<string, string>) {
  const url = new URL(`${siteOrigin(env('SITE_URL'))}/dashboard`);
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
    return json({ url: authUrl(await signState(user.id)) });
  }

  if (req.method !== 'GET') return fail(405, 'method_not_allowed', 'Method not allowed.');

  const params = new URL(req.url).searchParams;
  if (params.get('error')) return backToDashboard({ google: 'denied' });

  const userId = await verifyState(params.get('state') || '');
  const code = params.get('code');
  if (!userId || !code) return backToDashboard({ google: 'expired' });

  // The state was signed for a specific hub member; make sure they still are one.
  const { data: profile } = await admin.from('hub_profiles').select('role').eq('id', userId).maybeSingle();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') return backToDashboard({ google: 'forbidden' });

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
    const saved = await saveRefreshToken(admin, userId, profile.role, {
      email: tokens.email,
      refreshToken: tokens.refreshToken,
      scope: granted,
    });
    if (!saved) return backToDashboard({ google: 'not_ready' });
    return backToDashboard({ google: 'connected' });
  } catch (e) {
    console.error('[google-oauth]', e);
    return backToDashboard({ google: 'error' });
  }
});
