import { useState } from 'react';
import { conferenceApi } from './conferenceApi';
import { centralToIso } from './time';
import { announceWorkflowChange } from './workflowApi';
import { Button, Notice } from './ui';

export default function CallWrapUp({ customerId, name, onClose }: { customerId: string; name: string; onClose: () => void }) {
  const [entryId] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState('Needs bill');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="pg-room-overlay fixed inset-0 z-[85] grid place-items-center bg-hub-scrim p-4">
    <form aria-labelledby="wrap-title" role="dialog" aria-modal="true" className="today-wrap" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        await conferenceApi.wrapUp(customerId, entryId, outcome, note, date ? centralToIso(date, '09:00') : null);
        announceWorkflowChange(customerId);
        onClose();
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the call.'); setBusy(false); }
    }}>
      <h2 id="wrap-title">Call wrap-up</h2><p>{name}</p>
      <label>Outcome<select autoFocus value={outcome} onChange={e => setOutcome(e.target.value)}>
        {['Needs bill', 'Proposal reviewed', 'No-show', 'Other'].map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label>Call note<textarea rows={3} maxLength={600} value={note} onChange={e => setNote(e.target.value)} /></label>
      <label>Follow-up date (optional, 9 AM Central)<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save wrap-up'}</Button>
      <Button disabled={busy} type="button" variant="ghost" onClick={onClose}>Skip</Button></div>
    </form>
  </div>;
}
