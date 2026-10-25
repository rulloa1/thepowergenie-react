/**
 * Bytes the bill model actually reads.
 * JPEG, PNG, WEBP, and PDF are passed through. HEIC/HEIF (iPhone photos)
 * becomes a JPEG copy in memory. Callers keep the original file for Horace.
 */

import { createRequire } from 'node:module'
import { isHeifMedia } from '../supabase/functions/_shared/bill-file.js'

const require = createRequire(import.meta.url)

type HeicConvert = (options: {
  buffer: Buffer
  format: 'JPEG'
  quality: number
}) => Promise<Uint8Array>

let heicConvert: HeicConvert | undefined

function converter(): HeicConvert {
  if (!heicConvert) heicConvert = require('heic-convert') as HeicConvert
  return heicConvert
}

export async function billImageForModel(
  bytes: Uint8Array,
  mediaType: string,
): Promise<{ bytes: Uint8Array; mediaType: string }> {
  if (!isHeifMedia(mediaType)) return { bytes, mediaType }
  const jpeg = new Uint8Array(
    await converter()({
      buffer: Buffer.from(bytes),
      format: 'JPEG',
      quality: 0.85,
    }),
  )
  if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
    throw new Error('HeicConvertError')
  }
  return { bytes: jpeg, mediaType: 'image/jpeg' }
}
