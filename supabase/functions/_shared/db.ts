import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { env, serviceKey } from './http.ts';
import { leadIntervals } from './slots.ts';

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

/** Website consults block this many minutes on /book. Matches SLOT_DURATION_MINUTES. */
function assistantSlotMinutes() {
  const raw = Number(env('SLOT_DURATION_MINUTES'));
  if (!Number.isInteger(raw) || raw < 30 || raw > 240) return 120;
  return raw;
}

/**
 * Busy time overlapping [timeMin, timeMax): booked hub appointments plus
 * website-assistant consults. A failure throws so /book does not offer a
 * slot it could not check.
 */
export async function bookedIntervals(admin: Admin, timeMin: string, timeMax: string) {
  const minDay = new Date(Date.parse(timeMin) - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const maxDay = new Date(Date.parse(timeMax) + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [hub, leads] = await Promise.all([
    admin
      .from('hub_appointments')
      .select('starts_at, ends_at')
      .eq('status', 'booked')
      .lt('starts_at', timeMax)
      .gt('ends_at', timeMin),
    admin
      .from('powergenie_customers')
      .select('appointment_date')
      .gte('appointment_date', minDay)
      .lt('appointment_date', maxDay)
      .limit(500),
  ]);
  if (hub.error) throw hub.error;
  if (leads.error) throw leads.error;
  const appointments = (hub.data ?? []).map((r) => ({ start: r.starts_at as string, end: r.ends_at as string }));
  const assistant = leadIntervals(
    (leads.data ?? []).map((row) => row.appointment_date as string | null),
    timeMin,
    timeMax,
    assistantSlotMinutes(),
  );
  return [...appointments, ...assistant];
}
