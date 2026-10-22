import type { SupabaseClient } from '@supabase/supabase-js';

export type ApiResult = {
  ok: boolean;
  status: number;
  json: unknown;
};

export async function apiFetch(client: SupabaseClient, path: string, init?: RequestInit): Promise<ApiResult> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, status: 401, json: { error: 'unauthorized', message: 'Sign in required.' } };
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    const response = await fetch(path, { ...init, headers, cache: 'no-store' });
    return { ok: response.ok, status: response.status, json: await readBody(response) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

export async function publicFetch(path: string, init?: RequestInit): Promise<ApiResult> {
  try {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...init, headers, cache: 'no-store' });
    return { ok: response.ok, status: response.status, json: await readBody(response) };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function readMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const message = (json as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export function isNotConfiguredResult(result: ApiResult): boolean {
  if (result.status === 0 || result.status === 404) return true;
  if (result.json && typeof result.json === 'object') {
    return (result.json as { error?: unknown }).error === 'not_configured';
  }
  return result.status === 200 || result.status === 503;
}

export function readSlots(json: unknown): string[] | null {
  if (!json || typeof json !== 'object') return null;
  const slots = (json as { slots?: unknown }).slots;
  if (!Array.isArray(slots) || !slots.every((item) => typeof item === 'string')) return null;
  return slots;
}
