import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import { Button, Spinner } from './ui';

interface DeleteLeadDialogProps {
  name: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteLeadDialog({
  name,
  busy,
  error,
  onCancel,
  onConfirm,
}: DeleteLeadDialogProps) {
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
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-hub-scrim p-3 sm:items-center"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-hub-surface p-5 text-hub-ink shadow-2xl outline-none"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-hub-danger-soft text-hub-danger">
            <Trash2 className="h-5 w-5" />
          </span>
          <h2 id={titleId} className="m-0 text-lg font-bold text-hub-ink">
            Delete this lead?
          </h2>
        </div>

        <p className="mt-3 text-[0.95rem] leading-relaxed text-hub-soft">
          Are you sure you want to delete <strong className="font-bold text-hub-ink">{name}</strong>?
          This removes the lead from your active customer list.
        </p>

        {error && (
          <p className="mt-3 text-[0.9rem] text-hub-danger-ink" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy} className="w-full sm:w-auto">
            {busy ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Delete lead
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
