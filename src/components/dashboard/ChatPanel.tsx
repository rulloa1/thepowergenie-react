import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DASHBOARD_BUCKET, MAX_UPLOAD_BYTES, storagePath, type DashboardProfile } from '../../lib/dashboard';
import { Notice, fieldClass, primaryButtonClass, secondaryButtonClass } from './ui';

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  created_at: string;
};

const messageColumns = 'id, sender_id, body, attachment_path, attachment_name, attachment_mime, created_at';

function parseMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.sender_id !== 'string' || typeof row.created_at !== 'string') return null;
  return {
    id: row.id,
    sender_id: row.sender_id,
    body: typeof row.body === 'string' ? row.body : '',
    attachment_path: typeof row.attachment_path === 'string' ? row.attachment_path : null,
    attachment_name: typeof row.attachment_name === 'string' ? row.attachment_name : null,
    attachment_mime: typeof row.attachment_mime === 'string' ? row.attachment_mime : null,
    created_at: row.created_at,
  };
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const message of [...current, ...incoming]) map.set(message.id, message);
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export default function ChatPanel({
  client,
  profile,
  preview = false,
}: {
  client: SupabaseClient | null;
  profile: DashboardProfile;
  preview?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (preview || !client) return undefined;
    let cancelled = false;

    const loadNames = async () => {
      const { data } = await client.from('profiles').select('id, display_name, email');
      if (cancelled || !Array.isArray(data)) return;
      const next: Record<string, string> = {};
      for (const row of data) {
        const record = row as { id?: unknown; display_name?: unknown; email?: unknown };
        if (typeof record.id !== 'string') continue;
        const label = typeof record.display_name === 'string' && record.display_name
          ? record.display_name
          : typeof record.email === 'string'
            ? record.email
            : 'Dashboard';
        next[record.id] = label;
      }
      setNames(next);
    };

    const loadMessages = async () => {
      const { data, error: loadError } = await client
        .from('chat_messages')
        .select(messageColumns)
        .order('created_at', { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (loadError) {
        setError('Could not load the conversation.');
        return;
      }
      const incoming = (data ?? []).map(parseMessage).filter((row): row is ChatMessage => Boolean(row));
      setMessages((current) => mergeMessages(current, incoming));
    };

    void loadNames();
    void loadMessages();
    const poll = window.setInterval(() => { void loadMessages(); }, 20000);
    const channel = client
      .channel(`dashboard-chat-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const row = parseMessage(payload.new);
        if (!row) return;
        setMessages((current) => mergeMessages(current, [row]));
      })
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void client.removeChannel(channel);
    };
  }, [client, preview]);

  useEffect(() => {
    if (preview || !client) return undefined;
    const paths = messages.map((message) => message.attachment_path).filter((path): path is string => Boolean(path));
    if (paths.length === 0) return undefined;
    let cancelled = false;
    const refresh = () => {
      void client.storage.from(DASHBOARD_BUCKET).createSignedUrls(paths, 60 * 10).then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        for (const item of data) {
          if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
        }
        setUrls(next);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 8 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, messages, preview]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (!text && !file) return;
    if (preview || !client) {
      setError('Preview only. Messages send after Supabase is configured.');
      return;
    }
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError('Files need to be 25 MB or smaller.');
      return;
    }
    setSending(true);
    setError(null);
    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    let attachmentMime: string | null = null;
    if (file) {
      attachmentPath = storagePath('chat', profile.id, file.name);
      attachmentName = file.name;
      attachmentMime = file.type || null;
      const { error: uploadError } = await client.storage.from(DASHBOARD_BUCKET).upload(attachmentPath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadError) {
        setSending(false);
        setError('Could not upload that file.');
        return;
      }
    }
    const { data, error: insertError } = await client
      .from('chat_messages')
      .insert({
        sender_id: profile.id,
        body: text,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        attachment_mime: attachmentMime,
      })
      .select(messageColumns)
      .single();
    setSending(false);
    if (insertError || !data) {
      if (attachmentPath) await client.storage.from(DASHBOARD_BUCKET).remove([attachmentPath]);
      setError('Could not send that message.');
      return;
    }
    const saved = parseMessage(data);
    if (saved) setMessages((current) => mergeMessages(current, [saved]));
    setBody('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className="flex min-h-[68vh] flex-col rounded-[18px] bg-white shadow-[0_12px_32px_rgba(10,20,40,0.08)]" aria-label="Chat">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="m-0 text-[#4A5568]">No messages yet. This room is only for Horace and Rory.</p>
        ) : messages.map((message) => {
          const mine = message.sender_id === profile.id;
          const image = message.attachment_mime?.startsWith('image/') && message.attachment_path
            ? urls[message.attachment_path]
            : null;
          return (
            <article key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'ml-auto bg-[#0B2233] text-white' : 'bg-[#F4F7FB] text-[#1A1A2E]'}`}>
              <p className={`m-0 text-xs font-semibold ${mine ? 'text-[#F6CF85]' : 'text-[#0066CC]'}`}>
                {names[message.sender_id] || (mine ? 'You' : 'Dashboard')}
              </p>
              {message.body ? <p className="m-0 mt-1 whitespace-pre-wrap text-[0.98rem] leading-relaxed">{message.body}</p> : null}
              {message.attachment_path ? (
                <div className="mt-2">
                  {image ? <img src={image} alt={message.attachment_name || 'Attachment'} className="max-h-48 rounded-lg" /> : null}
                  <a
                    className={`mt-1 inline-block text-sm font-semibold underline ${mine ? 'text-white' : 'text-[#0066CC]'}`}
                    href={urls[message.attachment_path] || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {message.attachment_name || 'Download file'}
                  </a>
                </div>
              ) : null}
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form className="grid gap-3 border-t border-[#E6EAF2] p-4" onSubmit={(event) => void send(event)}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {file ? <p className="m-0 text-sm text-[#4A5568]">Attached: {file.name}</p> : null}
        <textarea
          className={`${fieldClass} min-h-20 resize-y`}
          value={body}
          maxLength={4000}
          placeholder="Write a message"
          aria-label="Message"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.heic,.webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" className={secondaryButtonClass} onClick={() => fileRef.current?.click()}>
            Attach file
          </button>
          {file ? (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                setFile(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Remove file
            </button>
          ) : null}
          <button type="submit" className={primaryButtonClass} disabled={sending || (!body.trim() && !file)}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}
