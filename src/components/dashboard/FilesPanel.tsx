import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DASHBOARD_BUCKET, MAX_UPLOAD_BYTES, formatBytes, storagePath, type DashboardProfile } from '../../lib/dashboard';
import { Notice, primaryButtonClass, secondaryButtonClass } from './ui';

type FileRow = {
  id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

function parseFile(value: unknown): FileRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.storage_path !== 'string' || typeof row.file_name !== 'string' || typeof row.created_at !== 'string') {
    return null;
  }
  return {
    id: row.id,
    uploaded_by: typeof row.uploaded_by === 'string' ? row.uploaded_by : '',
    storage_path: row.storage_path,
    file_name: row.file_name,
    mime_type: typeof row.mime_type === 'string' ? row.mime_type : null,
    size_bytes: typeof row.size_bytes === 'number' ? row.size_bytes : null,
    created_at: row.created_at,
  };
}

export default function FilesPanel({
  client,
  profile,
  preview = false,
}: {
  client: SupabaseClient | null;
  profile: DashboardProfile;
  preview?: boolean;
}) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (preview || !client) return;
    const { data, error: loadError } = await client
      .from('files')
      .select('id, uploaded_by, storage_path, file_name, mime_type, size_bytes, created_at')
      .order('created_at', { ascending: false });
    if (loadError) {
      setError('Could not load files.');
      return;
    }
    setFiles((data ?? []).map(parseFile).filter((row): row is FileRow => Boolean(row)));
  }, [client, preview]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (preview || !client) return undefined;
    const paths = files.map((file) => file.storage_path);
    if (paths.length === 0) return undefined;
    let cancelled = false;
    void client.storage.from(DASHBOARD_BUCKET).createSignedUrls(paths, 60 * 10).then(({ data }) => {
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      for (const item of data) {
        if (item.path && item.signedUrl) next[item.path] = item.signedUrl;
      }
      setUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [client, files, preview]);

  async function upload(file: File) {
    if (preview || !client) {
      setError('Preview only. Uploads start working after Supabase is configured.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Files need to be 25 MB or smaller.');
      return;
    }
    setBusy(true);
    setError(null);
    const path = storagePath('library', profile.id, file.name);
    const { error: uploadError } = await client.storage.from(DASHBOARD_BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) {
      setBusy(false);
      setError('Could not upload that file.');
      return;
    }
    const { error: insertError } = await client.from('files').insert({
      uploaded_by: profile.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    });
    if (insertError) {
      await client.storage.from(DASHBOARD_BUCKET).remove([path]);
      setBusy(false);
      setError('Could not save that file.');
      return;
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    await reload();
  }

  async function remove(row: FileRow) {
    if (preview || !client) return;
    if (!window.confirm(`Delete ${row.file_name}? This removes it for both of you.`)) return;
    setError(null);
    const { error: storageError } = await client.storage.from(DASHBOARD_BUCKET).remove([row.storage_path]);
    if (storageError) {
      setError('Could not delete that file.');
      return;
    }
    const { error: deleteError } = await client.from('files').delete().eq('id', row.id);
    if (deleteError) {
      setError('The file was removed from storage but the list did not update. Refresh.');
      return;
    }
    setFiles((current) => current.filter((file) => file.id !== row.id));
  }

  return (
    <section className="rounded-[18px] bg-white p-4 shadow-[0_12px_32px_rgba(10,20,40,0.08)] sm:p-6" aria-label="Files">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-bold tracking-tight">Files</h2>
          <p className="m-0 mt-1 text-sm text-[#4A5568]">Documents and photos shared with the dashboard. Only signed-in dashboard users can open them.</p>
        </div>
        <div>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.heic,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
      {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
      {files.length === 0 ? (
        <p className="mb-0 mt-6 text-[#4A5568]">No files yet. Upload a document or photo to share it here.</p>
      ) : (
        <ul className="mt-6 grid gap-3 p-0">
          {files.map((file) => {
            const href = urls[file.storage_path];
            const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(file.created_at));
            return (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6EAF2] p-3">
                <div className="min-w-0">
                  {file.mime_type?.startsWith('image/') && href ? (
                    <img src={href} alt="" className="mb-2 max-h-28 rounded-lg" />
                  ) : null}
                  <p className="m-0 truncate font-semibold">{file.file_name}</p>
                  <p className="m-0 text-sm text-[#4A5568]">{[formatBytes(file.size_bytes), when].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex gap-2">
                  <a className={secondaryButtonClass} href={href || '#'} target="_blank" rel="noopener noreferrer">
                    Download
                  </a>
                  <button type="button" className={secondaryButtonClass} onClick={() => void remove(file)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
