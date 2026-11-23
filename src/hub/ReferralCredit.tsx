import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui';

export default function ReferralCredit({ id, rep }: { id: string; rep: string }) {
  const [status, setStatus] = useState<'loading'|'open'|'busy'|'confirmed'|'unavailable'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (supabase) void supabase.from('hub_referral_qualifications').select('appointment_id').eq('appointment_id', id).maybeSingle().then(result => {
      if (active) setStatus(result.error ? 'unavailable' : result.data ? 'confirmed' : 'open');
    });
    return () => { active = false; };
  }, [id]);
  async function confirm() {
    if (!supabase || !window.confirm('Confirm this home qualifies for $500 credit to ' + rep + ' and $500 to the site partner?')) return;
    setStatus('busy');
    setError('');
    const result = await supabase.rpc('confirm_referral_home', { booking_id: id });
    if (result.error) {
      setStatus('open');
      setError(result.error.code === '23505' ? 'This service address already has a confirmed referral.' : 'Confirmation failed. Check the referral record and try again.');
    } else setStatus('confirmed');
  }
  if (status === 'loading') return null;
  return <div className="w-full" aria-live="polite">{status === 'confirmed' ? 'Qualified · $500 rep credit and $500 site partner credit recorded.' :
    status === 'unavailable' ? 'Referral credit records unavailable.' : <Button type="button" variant="ghost" disabled={status === 'busy'} onClick={confirm}>Confirm qualified home</Button>}{error && <p>{error}</p>}</div>;
}
