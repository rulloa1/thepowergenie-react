import { MAX_BILL_BYTES } from '../shared/types'
import { HttpError } from './http'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export function mimeFromName(fileName: string): string | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic'
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
  if (declared === 'image/heic' || declared === 'image/heif') {
    throw new HttpError(415, 'HEIC photos are not supported. Please upload a JPEG, PNG, or PDF.')
  }
  if (!ALLOWED.has(declared)) {
    throw new HttpError(415, 'Please upload a JPEG, PNG, WEBP, or PDF.')
  }
  return declared
}

export function sniffMedia(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'application/pdf'
  }
  if (bytes.length >= 12) {
    const brand = String.fromCharCode(...bytes.slice(4, 12))
    if (brand.includes('heic') || brand.includes('heif') || brand.includes('mif1')) return 'image/heic'
  }
  return null
}

export function assertBillBytes(bytes: Uint8Array, declared: string): string {
  if (bytes.byteLength <= 0) throw new HttpError(400, 'That file is empty.')
  if (bytes.byteLength > MAX_BILL_BYTES) {
    throw new HttpError(413, 'That file is over 10 MB. Try a photo or a smaller PDF.')
  }
  const sniffed = sniffMedia(bytes)
  if (sniffed === 'image/heic') {
    throw new HttpError(415, 'HEIC photos are not supported. Please upload a JPEG, PNG, or PDF.')
  }
  if (!sniffed || sniffed !== declared) {
    throw new HttpError(415, 'That file does not look like a JPEG, PNG, WEBP, or PDF.')
  }
  return sniffed
}

export function safeFileName(fileName: string, mimeType: string): string {
  const base = fileName.split(/[/\\]/).pop() || 'light-bill'
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const trimmed = cleaned.slice(0, 80) || 'light-bill'
  if (trimmed.includes('.')) return trimmed
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  return `${trimmed}.${extension}`
}
