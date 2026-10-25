import { refreshSmtAuthorizations } from '../../server/smt/store';
import { supabaseConfig } from '../../server/supabase.js';

export const maxDuration = 60;

function unauthorized(): Response {
  return Response.json(
    { error: 'unauthorized', message: 'That action is not available.' },
    { status: 401, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!secret || !token || token !== secret) return unauthorized();
  try {
    supabaseConfig();
  } catch {
    return Response.json({ ok: true, checked: 0 }, { headers: { 'cache-control': 'no-store' } });
  }
  const result = await refreshSmtAuthorizations();
  return Response.json({ ok: true, checked: result.checked }, { headers: { 'cache-control': 'no-store' } });
}
