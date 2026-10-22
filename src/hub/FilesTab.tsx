import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Image as ImageIcon, Search, Trash2, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button, Notice, Spinner, inputClass } from './ui';
import { formatBytes, formatDateTime } from './time';

const BUCKET = 'hub-files';
const MAX_FILE = 50 * 1024 * 1024;

interface StoredFile {
  name: string;
  created_at: string | null;
  metadata: { size?: number; mimetype?: string } | null;
}

const clean = (name: string) => name.replace(/[^\w.\- ()]+/g, '_').slice(-150) || 'file';

export default function FilesTab() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase!.storage
      .from(BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
    setLoading(false);
    if (error) return setError(`Couldn't load files: ${error.message}`);
    setFiles(((data ?? []) as StoredFile[]).filter((f) => f.name !== '.emptyFolderPlaceholder' && f.metadata));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const existing = new Set(files.map((f) => f.name));
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE) {
        setError(`${file.name} is over 50 MB.`);
        continue;
      }
      let name = clean(file.name);
      if (existing.has(name)) {
        const dot = name.lastIndexOf('.');
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        name = dot > 0 ? `${name.slice(0, dot)} (${stamp})${name.slice(dot)}` : `${name} (${stamp})`;
      }
      setUploading(file.name);
      const { error } = await supabase!.storage.from(BUCKET).upload(name, file, { contentType: file.type || undefined, upsert: false });
      if (error) setError(`Upload of ${file.name} failed: ${error.message}`);
      existing.add(name);
    }
    setUploading(null);
    if (input.current) input.current.value = '';
    load();
  };

  const open = async (name: string, download: boolean) => {
    const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(name, 60, download ? { download: name } : undefined);
    if (error || !data) return setError(`Couldn't open ${name}.`);
    if (download) window.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank', 'noopener');
  };

  const remove = async (name: string) => {
    if (!confirm(`Delete “${name}”? This can't be undone.`)) return;
    const { error } = await supabase!.storage.from(BUCKET).remove([name]);
    if (error) return setError(`Couldn't delete: ${error.message}`);
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const shown = files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section aria-label="Shared files" className="rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="m-0 text-lg font-bold">Files</h2>
          <p className="m-0 text-[0.86rem] text-[#6B7280]">Private to Horace and Rory. Links expire after a minute.</p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={!!uploading}>
          {uploading ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
        <input ref={input} type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
      </div>

      <div
        className="mt-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A3]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" aria-label="Search files" className={`${inputClass} pl-10`} />
        </div>

        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

        {loading ? (
          <div className="py-10 text-center text-[#6B7280]"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-[#E3E8EF] px-4 py-12 text-center text-[#6B7280]">
            {files.length ? 'No files match that search.' : 'No files yet. Upload documents or photos, or drop them here.'}
          </div>
        ) : (
          <ul className="m-0 mt-3 list-none divide-y divide-[#EEF1F5] p-0">
            {shown.map((f) => {
              const isImage = (f.metadata?.mimetype || '').startsWith('image/');
              const Icon = isImage ? ImageIcon : FileText;
              return (
                <li key={f.name} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F7]">
                    <Icon className="h-5 w-5 text-[#4A5568]" />
                  </span>
                  <button onClick={() => open(f.name, false)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-semibold">{f.name}</span>
                    <span className="text-[0.8rem] text-[#6B7280]">
                      {formatBytes(f.metadata?.size)} {f.created_at ? `· ${formatDateTime(f.created_at)}` : ''}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label={`View ${f.name}`} onClick={() => open(f.name, false)}><Eye className="h-4 w-4" /></IconButton>
                    <IconButton label={`Download ${f.name}`} onClick={() => open(f.name, true)}><Download className="h-4 w-4" /></IconButton>
                    <IconButton label={`Delete ${f.name}`} onClick={() => remove(f.name)} danger><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label.split(' ')[0]}
      className={`flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F1F3F7] ${danger ? 'text-[#B42318]' : 'text-[#4A5568]'}`}
    >
      {children}
    </button>
  );
}
