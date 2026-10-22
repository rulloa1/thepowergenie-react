import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
)?.trim();

/**
 * How the visitor arrived. Supabase invite / password-reset links land on /dashboard with
 * `type=invite` or `type=recovery`; read it before the client consumes the URL.
 */
export const arrivalAuthType: string | null = (() => {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('type') || query.get('type');
})();

/** Null when the site hasn't been given its Supabase keys yet. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;

export interface FnError {
  status: number;
  code: string;
  message: string;
}

/** Call an Edge Function and normalise errors into { status, code, message }. */
export async function callFunction<T>(
  name: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<{ data: T | null; error: FnError | null }> {
  if (!supabase) {
    return { data: null, error: { status: 503, code: 'not_configured', message: 'Not configured yet.' } };
  }
  const { data, error } = await supabase.functions.invoke(name, {
    method: options.method ?? 'POST',
    body: options.body as never,
  });
  if (!error) return { data: data as T, error: null };
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const payload = await res.json().catch(() => ({}));
    return {
      data: null,
      error: {
        status: res.status,
        code: payload.error || 'error',
        message: payload.message || 'Something went wrong. Please try again.',
      },
    };
  }
  return {
    data: null,
    error: { status: 0, code: 'network', message: "Couldn't reach the server. Check your connection and try again." },
  };
}
