const prefix = '[Power Genie referral] ';

export function readBookingReferral(params: URLSearchParams) {
  const rep = (params.get('ref') || '').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, 64);
  const state = (params.get('state') || '').trim().toUpperCase();
  return { rep, state: /^[A-Z]{2}$/.test(state) ? state : '' };
}

export function referralNoteHeader(rep: string, state: string) {
  if (!rep && !state) return '';
  return prefix + new URLSearchParams({ ref: rep, state }).toString() + '\n';
}

export function referralFromNote(note?: string | null) {
  if (!note?.startsWith(prefix)) return { rep: '', state: '' };
  return readBookingReferral(new URLSearchParams(note.split('\n', 1)[0].slice(prefix.length)));
}
