import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnv } from './env';

export type DashboardProfile = {
  id: string;
  email: string;
  role: 'owner' | 'admin';
  display_name: string | null;
};

export function createAdmin(env: ServerEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireDashboardUser(
  admin: SupabaseClient,
  token: string | null,
): Promise<{ profile: DashboardProfile } | { error: { status: number; message: string } }> {
  if (!token) {
    return { error: { status: 401, message: 'Sign in required.' } };
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { error: { status: 401, message: 'Sign in required.' } };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, display_name')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: { status: 403, message: 'This account is not invited to the dashboard.' } };
  }

  const row = profile as {
    id?: unknown;
    email?: unknown;
    role?: unknown;
    display_name?: unknown;
  };
  if (typeof row.id !== 'string' || typeof row.email !== 'string') {
    return { error: { status: 403, message: 'This account is not invited to the dashboard.' } };
  }
  if (row.role !== 'owner' && row.role !== 'admin') {
    return { error: { status: 403, message: 'This account is not invited to the dashboard.' } };
  }

  return {
    profile: {
      id: row.id,
      email: row.email,
      role: row.role,
      display_name: typeof row.display_name === 'string' ? row.display_name : null,
    },
  };
}
