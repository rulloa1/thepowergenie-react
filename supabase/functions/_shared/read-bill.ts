/**
 * /book reads an uploaded bill by handing the bytes to the website assistant's
 * extractor (server/extract.ts behind POST /api/assistant?route=extract).
 * A failed read returns null and must not fail the booking.
 */

import { fieldsFromExtractPayload, type NormalizedBill } from './bill.ts'
import { BILL_MEDIA_TYPES, extensionForMedia } from './bill-file.ts'
import type { Admin } from './db.ts'
import { env, serviceKey } from './http.ts'
import { siteOrigin } from './notify.ts'

export async function readUploadedBill(admin: Admin, bytes: Uint8Array, mediaType: string): Promise<NormalizedBill | null> {
  if (!BILL_MEDIA_TYPES.has(mediaType)) {
    console.error('booking_bill_extract_skipped', mediaType || 'unknown')
    return null
  }
  // Supabase injects SUPABASE_SERVICE_ROLE_KEY and will not let a function
  // secret override a SUPABASE_ name, so that value often differs from the
  // sb_secret_ key on Vercel. EXTRACT_SHARED_SECRET is a name both sides can
  // set. The service-role key is only the fallback when the shared secret is unset.
  const key = env('EXTRACT_SHARED_SECRET') || serviceKey()
  const site = siteOrigin(env('SITE_URL'))
  if (!key) {
    console.error('booking_bill_extract_skipped', 'no_extract_auth')
    return null
  }
  const uploadId = crypto.randomUUID()
  const path = `pending/${uploadId}/light-bill.${extensionForMedia(mediaType)}`
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
