/**
 * Light-bill file kinds shared by /book and the website assistant.
 * No runtime imports: this file runs in Node and in Supabase Edge Functions.
 *
 * The original upload is what Horace keeps. HEIC/HEIF is turned into JPEG
 * only in memory, inside the website extractor, before the model sees it.
 */

export type BillKind = { ext: string; type: string }

/** Major brands from phone HEIC/HEIF photos. AVIF (`avif`/`avis`) is not a light-bill type. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'heif', 'mif1', 'msf1'])

const GENERIC_HEIF = new Set(['mif1', 'msf1', 'heif'])

export const BILL_MEDIA_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

export function isHeifMedia(mediaType: string): boolean {
  return mediaType === 'image/heic' || mediaType === 'image/heif'
}

export function extensionForMedia(mediaType: string): string {
  if (mediaType === 'application/pdf') return 'pdf'
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/heic') return 'heic'
  if (mediaType === 'image/heif') return 'heif'
  return 'jpg'
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  if (from < 0 || to > bytes.length || to < from) return ''
  let out = ''
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i]!)
  return out
}

/** File signature for a customer light bill. Null when the bytes are not a bill photo or PDF. */
export function sniffBill(bytes: Uint8Array): BillKind | null {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === '%PDF-') return { ext: 'pdf', type: 'application/pdf' }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', type: 'image/jpeg' }
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return { ext: 'png', type: 'image/png' }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return { ext: 'webp', type: 'image/webp' }
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12).toLowerCase()
    if (HEIF_BRANDS.has(brand)) {
      return GENERIC_HEIF.has(brand)
        ? { ext: 'heif', type: 'image/heif' }
        : { ext: 'heic', type: 'image/heic' }
    }
  }
  return null
}
