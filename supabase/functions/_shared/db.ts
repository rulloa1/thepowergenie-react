import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { env, serviceKey } from './http.ts';

export type Admin = SupabaseClient;

/** Service-role client. Bypasses RLS — only ever used server-side. */
export function adminClient(): Admin | null {
  const url = env('SUPABASE_URL');
  const key = serviceKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface HubUser {
  id: string;
  email: string;
  role: 'owner' | 'admin';
  full_name: string | null;
}

/** Resolve the caller from their Supabase access token and confirm they are a dashboard member. */
export async function hubUser(admin: Admin, req: Request): Promise<HubUser | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin
    .from('hub_profiles')
    .select('id, email, role, full_name')
    .eq('id', data.user.id)
    .maybeSingle();
  return (profile as HubUser) ?? null;
}

/** Booked appointments overlapping [timeMin, timeMax). */
export async function bookedIntervals(admin: Admin, timeMin: string, timeMax: string) {
  const { data, error } = await admin
    .from('hub_appointments')
    .select('starts_at, ends_at')
    .eq('status', 'booked')
    .lt('starts_at', timeMax)
    .gt('ends_at', timeMin);
  if (error) throw error;
  return (data ?? []).map((r) => ({ start: r.starts_at as string, end: r.ends_at as string }));
}
