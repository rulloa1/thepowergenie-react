import { supabase } from '../lib/supabase';

export class ConferenceError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(
  action: string,
  init: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.auth) {
    if (!supabase) throw new ConferenceError('The hub is not connected.', 503);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ConferenceError('Sign in again to start a room.', 401);
    headers.authorization = `Bearer ${token}`;
  }
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const params = new URLSearchParams({ route: 'conference', action, ...(init.query || {}) });
  const response = await fetch(`/api/assistant?${params.toString()}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new ConferenceError(payload?.error || 'The conference room did not answer. Please try again.', response.status);
  }
  return payload;
}

export type RoomInfo = {
  customerName: string;
  expiresAt: string;
  proposalUrl: string | null;
  invitePath: string;
};

export type JoinInfo = RoomInfo & {
  serverUrl: string;
  token: string;
  userName: string;
  startWithCamera?: boolean;
};

export type WaitingGuest = { id: string; name: string; camera?: boolean };

export const conferenceApi = {
  status: () => call<{ configured: boolean }>('status', { auth: true }),
  start: (customerId: string) => call<RoomInfo>('start', { method: 'POST', auth: true, body: { customerId } }),
  host: (customerId: string) => call<JoinInfo>('host', { method: 'POST', auth: true, body: { customerId } }),
  queue: (customerId: string) => call<{ invitePath: string | null; guests: WaitingGuest[] }>('queue', { auth: true, query: { customerId } }),
  admit: (customerId: string, guestId: string) => call<{ ok: true }>('admit', { method: 'POST', auth: true, body: { customerId, guestId } }),
  decline: (customerId: string, guestId: string) => call<{ ok: true }>('decline', { method: 'POST', auth: true, body: { customerId, guestId } }),
  lobby: (token: string) => call<{ customerName: string; expiresAt: string; proposalUrl: string | null }>('lobby', { query: { token } }),
  knock: (token: string, name: string, camera: boolean) => call<{ guestId: string; status: 'waiting'; userName: string; camera: boolean }>('knock', { method: 'POST', body: { token, name, camera } }),
  setCamera: (token: string, guestId: string, camera: boolean) => call<{ ok: true; camera: boolean }>('camera', { method: 'POST', body: { token, guestId, camera } }),
  guest: (token: string, guestId: string) => call<{ status: 'waiting' | 'denied' } | (JoinInfo & { status: 'admitted' })>('guest', { query: { token, guest: guestId } }),
};
