import type { CustomerDetails } from './bookingForm.js';

export const LIGHT_BILL_BUCKET = 'light-bills';
export const LIGHT_BILL_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_DASHBOARD_SITE = 'https://thepowergenie.theroyeffect.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIRM_TOKEN_RE = /^[0-9a-f]{64}$/i;

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const ALLOWED_MIME = new Set([
  ...Object.values(EXTENSION_MIME),
  'image/heic-sequence',
  'image/heif-sequence',
  'image/pjpeg',
]);

export type LightBillMeta = {
  name: string;
  mime: string;
  size: number;
};

export type LightBillResult =
  | { ok: true; value: LightBillMeta }
  | { ok: false; message: string };

const TYPE_MESSAGE = 'Use a PDF or a photo of the bill (JPG, PNG, HEIC, or another phone photo).';

function cleanName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F]/g, '').trim().slice(0, 180);
}

export function sanitizeBillFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80);
  return cleaned || 'light-bill';
}

function extensionOf(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? '').toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1);
}

export function normalizeBillMime(mime: string): string {
  const lower = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower === 'image/tif') return 'image/tiff';
  return lower;
}

export function validateLightBill(input: unknown): LightBillResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Choose a light bill file.' };
  }
  const record = input as Record<string, unknown>;
  const original = cleanName(record.name);
  const rawType = typeof record.type === 'string'
    ? record.type
    : typeof record.mime === 'string'
      ? record.mime
      : '';
  const size = typeof record.size === 'number' ? record.size : Number.NaN;

  if (!original) return { ok: false, message: 'Choose a light bill file.' };
  if (!Number.isInteger(size) || size <= 0) return { ok: false, message: 'That light bill file is empty.' };
  if (size > LIGHT_BILL_MAX_BYTES) return { ok: false, message: 'That light bill is larger than 10 MB.' };

  const mime = normalizeBillMime(rawType);
  const fromExt = EXTENSION_MIME[extensionOf(original)];
  if (!fromExt) return { ok: false, message: TYPE_MESSAGE };
  const generic = !mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
  if (!generic && !mimeAgrees(mime, fromExt)) return { ok: false, message: TYPE_MESSAGE };

  return {
    ok: true,
    value: {
      name: sanitizeBillFileName(original),
      mime: fromExt,
      size,
    },
  };
}

function mimeAgrees(mime: string, fromExt: string): boolean {
  if (!ALLOWED_MIME.has(mime)) return false;
  if (mime === fromExt) return true;
  if (fromExt === 'image/heic' && mime === 'image/heic-sequence') return true;
  if (fromExt === 'image/heif' && mime === 'image/heif-sequence') return true;
  return false;
}

export function acceptStoredBillMime(contentType: string | null | undefined): boolean {
  if (!contentType) return true;
  const mime = normalizeBillMime(contentType);
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') return true;
  return ALLOWED_MIME.has(mime);
}

export function lightBillStoragePath(fileName: string, objectId: string): string | null {
  if (!UUID_RE.test(objectId)) return null;
  const safe = sanitizeBillFileName(fileName);
  const path = `bills/${objectId.toLowerCase()}-${safe}`;
  return isLightBillObjectPath(path) ? path : null;
}

export function isLightBillObjectPath(path: string): boolean {
  const match = /^bills\/([0-9a-f-]{36})-([a-zA-Z0-9._-]{1,80})$/i.exec(path);
  return Boolean(match && UUID_RE.test(match[1]));
}

export function dashboardSite(site: string | null | undefined): string {
  if (!site) return DEFAULT_DASHBOARD_SITE;
  try {
    const url = new URL(site);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return DEFAULT_DASHBOARD_SITE;
    if (url.username || url.password) return DEFAULT_DASHBOARD_SITE;
    return url.origin;
  } catch {
    return DEFAULT_DASHBOARD_SITE;
  }
}

export function lightBillCalendarNote(site: string | null | undefined): string {
  const origin = dashboardSite(site);
  return `Last month's light bill is on the Power Genie dashboard. Open the appointment on the Schedule tab: ${origin}/dashboard. The file is not attached to this event.`;
}

export function calendarEventDescription(input: {
  customer: CustomerDetails;
  lightBillAttached: boolean;
  site: string | null;
}): string {
  const lines = [
    `Name: ${input.customer.name}`,
    `Phone: ${input.customer.phone}`,
    `Email: ${input.customer.email}`,
    `Address: ${input.customer.address}`,
    input.customer.note ? `Note: ${input.customer.note}` : null,
    input.lightBillAttached ? lightBillCalendarNote(input.site) : null,
    'Booked on thepowergenie.theroyeffect.com',
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function protocolAllowed(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

export function isSignedUploadUrl(value: string, supabaseUrl?: string | null): boolean {
  try {
    const url = new URL(value);
    if (!protocolAllowed(url) || url.username || url.password) return false;
    if (!url.pathname.includes('/storage/v1/object/upload/sign/light-bills/')) return false;
    if (!url.searchParams.get('token')) return false;
    if (supabaseUrl) {
      const expected = new URL(supabaseUrl);
      if (url.host !== expected.host) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isBillDownloadUrl(value: string, supabaseUrl: string): boolean {
  try {
    const url = new URL(value);
    const expected = new URL(supabaseUrl);
    if (!protocolAllowed(url) || url.username || url.password) return false;
    if (url.host !== expected.host) return false;
    const path = url.pathname;
    return path.includes('/storage/v1/object/sign/light-bills/')
      && !path.includes('/object/upload/')
      && !path.includes('/object/public/');
  } catch {
    return false;
  }
}

export function isConfirmToken(value: string): boolean {
  return CONFIRM_TOKEN_RE.test(value);
}

export type BillUploadGrant = {
  signedUrl: string;
  confirmToken: string;
};

export function toPublicBookBody(result: {
  startsAt: string;
  endsAt: string;
  upload: BillUploadGrant | null;
}): { ok: true; startsAt: string; endsAt: string; upload?: BillUploadGrant } {
  const body: { ok: true; startsAt: string; endsAt: string; upload?: BillUploadGrant } = {
    ok: true,
    startsAt: result.startsAt,
    endsAt: result.endsAt,
  };
  if (!result.upload) return body;
  if (!isSignedUploadUrl(result.upload.signedUrl) || !isConfirmToken(result.upload.confirmToken)) return body;
  return {
    ...body,
    upload: {
      signedUrl: result.upload.signedUrl,
      confirmToken: result.upload.confirmToken,
    },
  };
}

export function readBillUpload(json: unknown, supabaseUrl?: string | null): BillUploadGrant | null {
  if (!json || typeof json !== 'object') return null;
  const upload = (json as { upload?: unknown }).upload;
  if (!upload || typeof upload !== 'object') return null;
  const row = upload as { signedUrl?: unknown; confirmToken?: unknown };
  if (typeof row.signedUrl !== 'string' || typeof row.confirmToken !== 'string') return null;
  if (!isSignedUploadUrl(row.signedUrl, supabaseUrl) || !isConfirmToken(row.confirmToken)) return null;
  return { signedUrl: row.signedUrl, confirmToken: row.confirmToken };
}
