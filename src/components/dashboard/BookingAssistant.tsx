import { useEffect, useState } from 'react';
import { ASSISTANT_MAX_CHARS, type ChatTurn } from '../../lib/assistantPolicy';
import { publicFetch, readMessage } from '../../lib/api';
import { isConfirmToken, readBillUpload, type BillUploadGrant } from '../../lib/lightBill';
import { supabaseUrl } from '../../lib/supabaseClient';
import { fieldClass, primaryButtonClass, Notice } from './ui';

export type AssistantBooking = {
  startsAt: string;
  endsAt: string;
  upload: BillUploadGrant | null;
  billClaim: string | null;
  meterStatus: string | null;
};

const METER_STATUSES = new Set(['pending_setup', 'requested', 'approved', 'expired', 'failed']);

function previewThread(): ChatTurn[] {
  if (!import.meta.env.DEV) return [];
  return [
    {
      role: 'user',
      content: 'How much will I save if I go solar with Sunrun?',
    },
    {
      role: 'assistant',
      content: "I can't guarantee a price or a savings amount. Those depend on the home, and Horace will confirm them on the call. I can book an open time once I have your name, phone, email, and address. Connecting your meter is optional.",
    },
  ];
}

function readBooking(json: unknown): AssistantBooking | null {
  if (!json || typeof json !== 'object') return null;
  const booking = (json as { booking?: unknown }).booking;
  if (!booking || typeof booking !== 'object') return null;
  const row = booking as Record<string, unknown>;
  if (typeof row.startsAt !== 'string' || typeof row.endsAt !== 'string') return null;
  const meter = row.meter && typeof row.meter === 'object'
    ? (row.meter as { status?: unknown }).status
    : null;
  return {
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    upload: readBillUpload(booking, supabaseUrl),
    billClaim: typeof row.billClaim === 'string' && isConfirmToken(row.billClaim) ? row.billClaim : null,
    meterStatus: typeof meter === 'string' && METER_STATUSES.has(meter) ? meter : null,
  };
}

export default function BookingAssistant({
  preview = false,
  onBooked,
}: {
  preview?: boolean;
  onBooked: (booking: AssistantBooking) => void;
}) {
  const [enabled, setEnabled] = useState(preview);
  const [messages, setMessages] = useState<ChatTurn[]>(() => (
    import.meta.env.DEV && preview ? previewThread() : []
  ));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    const load = async () => {
      const result = await publicFetch('/api/book-assistant');
      if (cancelled) return;
      const record = result.json;
      const on = Boolean(
        result.ok
        && record
        && typeof record === 'object'
        && (record as { enabled?: unknown }).enabled === true,
      );
      setEnabled(on);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (!enabled) return null;

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    if (content.length > ASSISTANT_MAX_CHARS) {
      setError(`Keep each message under ${ASSISTANT_MAX_CHARS} characters.`);
      return;
    }
    setError(null);
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setDraft('');
    if (preview) {
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: "I can't guarantee a price or a savings amount. Horace will confirm those details on the call. Use the form below to pick an open time. Connecting your meter is optional.",
        },
      ]);
      return;
    }
    setSending(true);
    const result = await publicFetch('/api/book-assistant', {
      method: 'POST',
      body: JSON.stringify({ messages: next }),
    });
    setSending(false);
    if (!result.ok || !result.json || typeof result.json !== 'object') {
      setError(readMessage(result.json, 'The assistant is busy. You can still book with the form.'));
      return;
    }
    const reply = (result.json as { message?: unknown }).message;
    const text = typeof reply === 'string' && reply.trim()
      ? reply.trim()
      : 'Horace will confirm the details on the call. You can also use the form below.';
    setMessages([...next, { role: 'assistant', content: text }]);
    const booking = readBooking(result.json);
    if (booking) onBooked(booking);
  }

  return (
    <section id="booking-assistant" className="grid gap-3 rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)] sm:p-6">
      <div>
        <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">Ask about going solar</p>
        <h2 className="mt-1 text-xl font-bold">Booking assistant</h2>
        <p className="m-0 mt-2 text-sm leading-relaxed text-[#4A5568]">
          General answers about Sunrun and The Power Genie. Nothing here is a quote or a contract, and it does not promise a price or savings. Horace confirms the details on the call.
        </p>
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto" aria-live="polite">
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={`m-0 max-w-[95%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${message.role === 'user' ? 'justify-self-end bg-[#0B2233] text-white' : 'justify-self-start bg-[#F4F7FB] text-[#1A1A2E]'}`}
          >
            {message.content}
          </p>
        ))}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="grid gap-1 text-sm font-semibold" htmlFor="assistant-message">
          Your question
          <textarea
            id="assistant-message"
            className={`${fieldClass} min-h-20 resize-y`}
            maxLength={ASSISTANT_MAX_CHARS}
            value={draft}
            placeholder="Ask about going solar, or ask for an open time."
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="submit" className={primaryButtonClass} disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
