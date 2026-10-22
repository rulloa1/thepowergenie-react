import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from './http'

export type UploadReceipt = {
  uploadId: string
  path: string
  fileName: string
  mimeType: string
  exp: number
}

function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new HttpError(503, 'Scheduling is not configured yet. Please call Horace and we will set this up.')
  return key
}

export function sealReceipt(receipt: UploadReceipt): string {
  const payload = Buffer.from(JSON.stringify(receipt)).toString('base64url')
  const signature = createHmac('sha256', signingKey()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function openReceipt(token: string): UploadReceipt {
  const parts = token.split('.')
  if (parts.length !== 2) throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  const [payload, signature] = parts
  const expected = createHmac('sha256', signingKey()).update(payload).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  }
  let parsed: UploadReceipt
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadReceipt
  } catch {
    throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  }
  if (!parsed || typeof parsed.path !== 'string' || typeof parsed.uploadId !== 'string') {
    throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  }
  if (parsed.exp < Date.now()) throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  if (!parsed.path.startsWith(`pending/${parsed.uploadId}/`) || parsed.path.includes('..')) {
    throw new HttpError(400, 'That bill upload expired. Please attach it again.')
  }
  return parsed
}
