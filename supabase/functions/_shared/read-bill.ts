/**
 * /book reads an uploaded bill by handing the bytes to the website assistant's
 * extractor (server/extract.ts behind POST /api/assistant?route=extract).
 * A failed read returns null and must not fail the booking.
 */

import { fieldsFromExtractPayload, type NormalizedBill } from './bill.ts'
import type { Admin } from './db.ts'
import { env, serviceKey } from './http.ts'
import { siteOrigin } from './notify.ts'

const READABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

function extensionFor(mediaType: string): string {
  if (mediaType === 'application/pdf') return 'pdf'
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  return 'jpg'
}

export async function readUploadedBill(admin: Admin, bytes: Uint8Array, mediaType: string): Promise<NormalizedBill | null> {
  if (!READABLE.has(mediaType)) {
    console.error('booking_bill_extract_skipped', mediaType || 'unknown')
    return null
  }
  const key = serviceKey()
  const site = siteOrigin(env('SITE_URL'))
  if (!key) {
    console.error('booking_bill_extract_skipped', 'no_service_key')
    return null
  }
  const uploadId = crypto.randomUUID()
  const path = `pending/${uploadId}/light-bill.${extensionFor(mediaType)}`
  const uploaded = await admin.storage.from('powergenie').upload(path, bytes, { contentType: mediaType, upsert: false })
  if (uploaded.error) {
    console.error('booking_bill_extract_upload_failed', uploaded.error.message)
    return null
  }
  try {
    const response = await fetch(`${site}/api/assistant?route=extract`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(50_000),
    })
    if (!response.ok) {
      console.error('booking_bill_extract_failed', response.status)
      return null
    }
    const payload = await response.json().catch(() => null)
    return fieldsFromExtractPayload(payload)
  } catch (error) {
    console.error('booking_bill_extract_failed', error instanceof Error ? error.name : 'unknown')
    return null
  } finally {
    await admin.storage.from('powergenie').remove([path]).catch(() => {})
  }
}
