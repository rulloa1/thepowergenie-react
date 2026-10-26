// Small HTTP helpers shared by the Referral Hub Edge Functions.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

/** Error response. `code` is machine-readable; `message` is safe to show to a customer. */
export function fail(status: number, code: string, message: string) {
  return json({ error: code, message }, status);
}

export function notConfigured(missing: string[]) {
  // Name the missing settings in logs only; the client just gets a friendly message.
  console.warn('[not_configured] missing:', missing.join(', '));
  return fail(503, 'not_configured', 'This feature is not configured yet. Please check back soon.');
}

export function unauthorized() {
  return fail(401, 'unauthorized', 'Unauthorized.');
}

export function preflight(req: Request) {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

export function env(name: string): string {
  return (Deno.env.get(name) || '').trim();
}

export function missingEnv(names: string[]) {
  return names.filter((n) => !env(n));
}

/** Service-role key: legacy name first, then a custom secret for projects on the new key system. */
export function serviceKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY') || env('SB_SECRET_KEY');
}

export function siteUrl() {
  return (env('SITE_URL') || 'http://localhost:3000').replace(/\/+$/, '');
}
