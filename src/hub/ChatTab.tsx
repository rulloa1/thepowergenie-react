import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, Paperclip, SendHorizontal, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile } from './Dashboard';
import { Notice, Spinner, cn } from './ui';
import { centralDateKey, formatBytes, formatDay, formatTime } from './time';

const BUCKET = 'hub-chat';
const LINK_SECONDS = 60 * 60;
const RESIGN_EVERY_MS = 50 * 60 * 1000; // renew before the links expire
const MAX_ATTACHMENT = 25 * 1024 * 1024;

interface Message {
  id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file';

export default function ChatTab({ profile }: { profile: Profile }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sign = useCallback(async (list: Message[]) => {
    const paths = list.map((m) => m.attachment_path).filter((p): p is string => !!p);
    if (!paths.length) return;
    const { data } = await supabase!.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
    if (!data) return;
    setUrls((prev) => {
      const next = { ...prev };
      for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: ppl }, { data: msgs, error: msgErr }] = await Promise.all([
        supabase!.from('hub_profiles').select('id, email, full_name, role'),
        supabase!.from('hub_chat_messages').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      if (!alive) return;
      if (msgErr) setError("Couldn't load messages. Has the database been set up?");
      setPeople(Object.fromEntries(((ppl as Profile[]) ?? []).map((p) => [p.id, p])));
      const list = ((msgs as Message[]) ?? []).reverse();
      setMessages(list);
      setLoading(false);
      sign(list);
    })();

    const channel = supabase!
      .channel('hub-chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hub_chat_messages' }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
        sign([m]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hub_chat_messages' }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages((prev) => prev.filter((p) => p.id !== id));
      })
      .subscribe();

    return () => {
      alive = false;
      supabase!.removeChannel(channel);
    };
  }, [sign]);

  // Signed links expire after an hour; keep them fresh while the tab stays open.
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  useEffect(() => {
    const timer = window.setInterval(() => sign(messagesRef.current), RESIGN_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [sign]);

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, loading]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError(null);

    let attachment: Partial<Message> = {};
    if (file) {
      const path = `${profile.id}/${Date.now()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase!.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setSending(false);
        return setError(`Upload failed: ${upErr.message}`);
      }
      attachment = { attachment_path: path, attachment_name: file.name, attachment_type: file.type || null, attachment_size: file.size };
    }

    const { data, error: insErr } = await supabase!
      .from('hub_chat_messages')
      .insert({ sender_id: profile.id, body: body || null, ...attachment })
      .select('*')
      .single();
    setSending(false);
    if (insErr) return setError(`Couldn't send: ${insErr.message}`);
    const m = data as Message;
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
    sign([m]);
    setText('');
    setFile(null);
  };

  const pick = (f: File | null) => {
    if (f && f.size > MAX_ATTACHMENT) return setError('Attachments can be up to 25 MB.');
    setError(null);
    setFile(f);
  };

  const remove = async (m: Message) => {
    if (!confirm('Delete this message?')) return;
    await supabase!.from('hub_chat_messages').delete().eq('id', m.id);
    if (m.attachment_path) await supabase!.storage.from(BUCKET).remove([m.attachment_path]);
    setMessages((prev) => prev.filter((p) => p.id !== m.id));
  };

  return (
    <section className="flex min-h-[60vh] flex-1 flex-col rounded-3xl bg-hub-surface shadow-[0_10px_30px_rgba(10,20,40,0.06)]" aria-label="Team chat">
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6" style={{ maxHeight: 'calc(100dvh - 260px)' }}>
        {loading ? (
          <div className="py-10 text-center text-hub-soft"><Spinner /></div>
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-hub-soft">No messages yet. Say hi to the team 👋</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === profile.id;
            const who = people[m.sender_id];
            const newDay = i === 0 || centralDateKey(messages[i - 1].created_at) !== centralDateKey(m.created_at);
            const url = m.attachment_path ? urls[m.attachment_path] : undefined;
            const isImage = (m.attachment_type || '').startsWith('image/') && !/heic|heif/i.test(m.attachment_type || '');
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <p className="my-4 text-center text-[0.74rem] font-semibold uppercase tracking-wide text-hub-soft">
                    {formatDay(m.created_at)}
                  </p>
                )}
                <div className={cn('group mb-3 flex flex-col', mine ? 'items-end' : 'items-start')}>
                  <span className="mb-1 px-1 text-[0.74rem] text-hub-soft">
                    {mine ? 'You' : who?.full_name || who?.email || 'Teammate'} · {formatTime(m.created_at)}
                    {mine && (
                      <button onClick={() => remove(m)} className="ml-2 text-hub-danger opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                        Delete
                      </button>
                    )}
                  </span>
                  <div
                    className={cn(
                      'max-w-[85%] overflow-hidden rounded-2xl text-[0.95rem] leading-relaxed sm:max-w-[70%]',
                      mine ? 'rounded-br-md bg-hub-navy text-white' : 'rounded-bl-md bg-hub-muted text-hub-ink',
                    )}
                  >
                    {m.attachment_path && isImage && url && (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={m.attachment_name || 'Image'} className="block max-h-72 w-full object-cover" loading="lazy" />
                      </a>
                    )}
                    {m.attachment_path && (!isImage || !url) && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn('flex items-center gap-2.5 px-3.5 py-2.5 no-underline', mine ? 'text-white' : 'text-hub-ink')}
                      >
                        <FileText className="h-5 w-5 shrink-0 opacity-80" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{m.attachment_name}</span>
                          <span className="text-[0.76rem] opacity-70">{formatBytes(m.attachment_size)}</span>
                        </span>
                      </a>
                    )}
                    {m.body && <p className="m-0 whitespace-pre-wrap break-words px-3.5 py-2.5">{m.body}</p>}
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t border-hub-line p-3 sm:p-4">
        {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
        {file && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-hub-muted px-3 py-2 text-[0.88rem]">
            <span className="min-w-0 truncate">📎 {file.name} · {formatBytes(file.size)}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove attachment" className="rounded-full p-1 hover:bg-hub-surface">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hub-line hover:border-hub-ink"
            aria-label="Attach a file or photo"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input ref={fileInput} type="file" className="sr-only" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Message the team…"
            aria-label="Message"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-hub-control bg-hub-surface px-3.5 py-2.5 text-[1rem] text-hub-ink outline-none placeholder:text-hub-faint focus:border-hub-focus focus:ring-4 focus:ring-hub-focus-soft"
          />
          <button
            type="submit"
            disabled={sending || (!text.trim() && !file)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-hub-accent-fill text-white disabled:bg-hub-muted disabled:text-hub-soft"
            aria-label="Send"
          >
            {sending ? <Spinner className="h-4 w-4" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </section>
  );
}
