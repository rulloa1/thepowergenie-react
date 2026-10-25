import { extensionForMedia, isHeifMedia, sniffBill } from '../supabase/functions/_shared/bill-file.js'
import { MAX_BILL_BYTES } from '../shared/types.js'
import { HttpError } from './http.js'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])

export function mimeFromName(fileName: string): string | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  return null
}

export function assertAllowedUpload(fileName: string, mimeType: string, sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new HttpError(400, 'That file is empty.')
  }
  if (sizeBytes > MAX_BILL_BYTES) {
    throw new HttpError(413, 'That file is over 10 MB. Try a photo or a smaller PDF.')
  }
  const declared = (mimeType || mimeFromName(fileName) || '').toLowerCase()
  if (!ALLOWED.has(declared)) {
    throw new HttpError(415, 'Please upload a JPEG, PNG, WEBP, HEIC, or PDF.')
  }
  return declared
}

export function sniffMedia(bytes: Uint8Array): string | null {
  return sniffBill(bytes)?.type ?? null
}

export function assertBillBytes(bytes: Uint8Array, declared: string): string {
  if (bytes.byteLength <= 0) throw new HttpError(400, 'That file is empty.')
  if (bytes.byteLength > MAX_BILL_BYTES) {
    throw new HttpError(413, 'That file is over 10 MB. Try a photo or a smaller PDF.')
  }
  const sniffed = sniffMedia(bytes)
  const heifPair = sniffed != null && isHeifMedia(declared) && isHeifMedia(sniffed)
  if (!sniffed || (sniffed !== declared && !heifPair)) {
    throw new HttpError(415, 'That file does not look like a JPEG, PNG, WEBP, HEIC, or PDF.')
  }
  return sniffed
}

export function safeFileName(fileName: string, mimeType: string): string {
  const base = fileName.split(/[/\\]/).pop() || 'light-bill'
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const trimmed = cleaned.slice(0, 80) || 'light-bill'
  if (trimmed.includes('.')) return trimmed
  return `${trimmed}.${extensionForMedia(mimeType)}`
}
