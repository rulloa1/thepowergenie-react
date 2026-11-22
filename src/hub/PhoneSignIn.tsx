import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Notice, Spinner } from './ui';

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  if (value.trim().startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  return null;
}

export default function PhoneSignIn() {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const inputClass = 'block min-h-12 w-full rounded-xl border border-[#9aaabe] bg-white px-3 py-2 text-[#172338]';
  const send = async () => {
    const number = normalizePhone(phone);
    if (!number) return setError('Enter your mobile number with its area code.');
    if (Date.now() < retryAt) return setError('Please wait one minute before requesting another code.');
    setBusy(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Sign-in is not connected yet.');
      const result = await supabase.auth.signInWithOtp({ phone: number, options: { shouldCreateUser: false, channel: 'sms' } });
      if (result.error) throw result.error;
      setSentTo(number);
      setRetryAt(Date.now() + 60_000);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not send a text. Please try again.';
      setError(/phone.*(disabled|not enabled)|unsupported.*phone|sms.*provider/i.test(message) ? 'Text-message sign-in is not enabled yet. Email and password are still available below.' : message);
    } finally { setBusy(false); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sentTo || !/^\d{6}$/.test(code)) return setError('Enter the six-digit code from your text message.');
    setBusy(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Sign-in is not connected yet.');
      const result = await supabase.auth.verifyOtp({ phone: sentTo, token: code, type: 'sms' });
      if (result.error) throw result.error;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'That code could not be verified. Please try again.'); }
    finally { setBusy(false); }
  };
  return <details className="mb-5 rounded-2xl border border-[#b8d4f2] bg-[#edf6ff] p-4"><summary className="min-h-8 cursor-pointer font-bold text-[#114b89]">Sign in with a text code</summary><form className="mt-3 grid gap-3" onSubmit={sentTo ? verify : (event) => { event.preventDefault(); void send(); }}>
    {!sentTo ? <label className="grid gap-2 text-sm font-semibold text-[#172338]">Mobile number<input type="tel" autoComplete="tel" inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(510) 241-7007" className={inputClass} /></label> : <><p className="m-0 text-sm text-[#172338]" role="status">Code sent to {sentTo}.</p><label className="grid gap-2 text-sm font-semibold text-[#172338]">Text-message code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className={inputClass} /></label></>}
    {error && <Notice tone="error">{error}</Notice>}
    <Button type="submit" disabled={busy}>{busy ? <Spinner /> : sentTo ? 'Verify code and sign in' : 'Text me a code'}</Button>
    {sentTo && <div className="flex flex-wrap gap-3 text-sm text-[#114b89]"><button type="button" disabled={busy} onClick={() => void send()}>Send another code</button><button type="button" disabled={busy} onClick={() => { setSentTo(null); setCode(''); setError(null); }}>Change number</button></div>}
    <p className="m-0 text-xs text-[#455f7c]">Use the mobile number linked to your invited account. Message and data rates may apply.</p>
  </form></details>;
}
