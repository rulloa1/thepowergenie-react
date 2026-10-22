export const DASHBOARD_BUCKET = 'dashboard-files';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type DashboardProfile = {
  id: string;
  email: string;
  role: 'owner' | 'admin';
  display_name: string | null;
};

export function storagePath(folder: 'library' | 'chat', userId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'file';
  return `${folder}/${userId}/${crypto.randomUUID()}-${safe}`;
}

export function formatBytes(size: number | null): string {
  if (size == null || !Number.isFinite(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
