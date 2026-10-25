import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockPageScroll } from '../lib/scrollLock';
import { Button, Spinner } from './ui';

export default function ArchiveLeadDialog({
  name,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#0A1220]/60 p-3 sm:items-center" onClick={() => { if (!busy) onCancel(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl outline-none"
      >
        <h2 id={titleId} className="m-0 text-lg font-bold text-[#1A1A2E]">Archive this lead?</h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-[#334155]">
          <strong className="font-bold text-[#1A1A2E]">{name}</strong> leaves the active list. This is the delete for a lead: the row and any light bill stay on file, and you can restore them from Archived.
        </p>
        {error && <p className="mt-3 text-[0.9rem] text-[#8A1F11]" role="alert">{error}</p>}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">Cancel</Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy} className="w-full sm:w-auto">
            {busy ? <Spinner className="h-4 w-4" /> : 'Archive lead'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
