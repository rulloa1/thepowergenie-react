import { randomUUID } from 'node:crypto'
import type { UIMessage } from 'ai'
import { EMPTY_BILL, type BillFields } from '../shared/types.js'
import { streamAssistant, streamTextResponse } from './chat.js'
import { extractBill } from './extract.js'
import { assertAllowedUpload, assertBillBytes, safeFileName, sniffMedia } from './files.js'
import { assertSameOrigin, clientIp, honeypotTripped, HttpError, isRecord, json, readWebJson } from './http.js'
import { saveLead } from './lead.js'
import { openReceipt, sealReceipt } from './receipt.js'
import { enforceRateLimit } from './rate-limit.js'
import { loadSlotRules } from './slot-rules.js'
import { chicagoDate, listSlots } from './slots.js'
import { assistantAvailabilityBusy } from './google-calendar.js'
import { createSignedUpload, deleteObject, downloadObject, hubBusyIntervals, serviceBearerAuthorized, takenAppointments } from './supabase.js'

const TEN_MINUTES = 10 * 60 * 1000

function guard(request: Request, bucket: string, limit: number, windowMs: number): void {
  assertSameOrigin(request)
  enforceRateLimit(`${bucket}:${clientIp(request)}`, limit, windowMs)
}

export async function handleChat(request: Request): Promise<Response> {
  guard(request, 'chat', 30, TEN_MINUTES)
  const body = await readWebJson(request, 80_000)
  if (!isRecord(body) || !Array.isArray(body.messages)) throw new HttpError(400, 'Invalid request.')
  if (honeypotTripped(body.pg_leave_blank)) {
    return streamTextResponse('Use the buttons below to upload your electric bill or book a free savings consult.')
  }
  return streamAssistant(body.messages as UIMessage[])
}

export async function handleUploads(request: Request): Promise<Response> {
  guard(request, 'upload', 10, TEN_MINUTES)
  const body = await readWebJson(request, 8_000)
  if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
  if (honeypotTripped(body.pg_leave_blank)) throw new HttpError(400, 'Please try that upload again.')
  const fileName = typeof body.fileName === 'string' ? body.fileName : 'light-bill'
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : NaN
  const declared = assertAllowedUpload(fileName, mimeType, sizeBytes)
  const uploadId = randomUUID()
  const safeName = safeFileName(fileName, declared)
  const path = `pending/${uploadId}/${safeName}`
  const signedUrl = await createSignedUpload(path)
  const receipt = sealReceipt({
    uploadId,
    path,
    fileName: safeName,
    mimeType: declared,
    exp: Date.now() + 2 * 60 * 60 * 1000,
  })
  return json({ signedUrl, receipt })
}

export async function handleBill(request: Request): Promise<Response> {
  guard(request, 'bill', 8, TEN_MINUTES)
  const body = await readWebJson(request, 16_000)
  if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
  if (honeypotTripped(body.pg_leave_blank)) return json({ fields: EMPTY_BILL, warning: null })
  if (typeof body.receipt !== 'string' || !body.receipt) throw new HttpError(400, 'Please attach the bill again.')
  const receipt = openReceipt(body.receipt)
  const bytes = await downloadObject(receipt.path)
  try {
    assertBillBytes(bytes, receipt.mimeType)
  } catch (error) {
    await deleteObject(receipt.path)
    throw error
  }
  const fields = await extractBill(bytes, receipt.mimeType)
  const warning = isBlankBill(fields)
    ? 'I could not read that automatically. You can type the details below, and Horace will still get the file.'
    : null
  return json({ fields, warning })
}

export async function handleSlots(request: Request): Promise<Response> {
  guard(request, 'slots', 60, TEN_MINUTES)
  const rules = loadSlotRules()
  const now = new Date()
  const from = chicagoDate(now, rules.timeZone)
  const horizon = new Date(now.getTime() + (rules.horizonDays + 2) * 24 * 60 * 60 * 1000)
  let taken = new Set<string>()
  let busy: { start: string; end: string }[] = []
  try {
    taken = new Set((await takenAppointments(from, chicagoDate(horizon, rules.timeZone))).keys())
    busy = await hubBusyIntervals(now.toISOString(), horizon.toISOString())
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 503) throw error
  }
  // Horace's calendar (and any member marked required) hides overlapping times.
  // A failed check stops the list instead of offering a time he may already be busy.
  busy = [...busy, ...await assistantAvailabilityBusy(now.toISOString(), horizon.toISOString())]
  const slots = listSlots(rules, now, taken, busy)
  return json({ slots, timeZone: rules.timeZone })
}

const PENDING_BILL = /^pending\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,80}$/i

/**
 * Service-to-service bill read used by the /book Edge Function.
 * Authorization must be EXTRACT_SHARED_SECRET or, as a fallback, this server's
 * SUPABASE_SERVICE_ROLE_KEY. Callers without one of those secrets are rejected.
 * The caller uploads into powergenie/pending and passes that path.
 * This is the same extractor the assistant uses. The temp object is deleted here.
 */
export async function handleExtract(request: Request): Promise<Response> {
  if (!serviceBearerAuthorized(request)) throw new HttpError(401, 'Unauthorized.')
  enforceRateLimit(`extract:${clientIp(request)}`, 30, TEN_MINUTES)
  const body = await readWebJson(request, 4_000)
  if (!isRecord(body) || typeof body.path !== 'string' || !PENDING_BILL.test(body.path)) {
    throw new HttpError(400, 'Invalid request.')
  }
  const path = body.path
  try {
    const bytes = await downloadObject(path)
    const sniffed = sniffMedia(bytes)
    if (!sniffed || sniffed === 'image/heic') return json({ fields: EMPTY_BILL, warning: 'unreadable' })
    assertBillBytes(bytes, sniffed)
    const fields = await extractBill(bytes, sniffed)
    const warning = isBlankBill(fields)
      ? 'I could not read that automatically. You can type the details below, and Horace will still get the file.'
      : null
    return json({ fields, warning })
  } finally {
    await deleteObject(path)
  }
}

export async function handleLead(request: Request): Promise<Response> {
  guard(request, 'lead', 5, 30 * 60 * 1000)
  const body = await readWebJson(request, 32_000)
  const confirmation = await saveLead(body)
  if (confirmation === 'honeypot') {
    return json({
      ok: true,
      confirmation: {
        id: 'received',
        name: 'there',
        slotLabel: 'the time you picked',
        phone: '',
        email: '',
        billAttached: false,
      },
    })
  }
  return json({ ok: true, confirmation })
}

function requestUrl(request: Request): URL {
  try {
    return new URL(request.url)
  } catch {
    return new URL(request.url, 'http://localhost')
  }
}

const ASSISTANT_ROUTES = new Set(['chat', 'uploads', 'bill', 'lead', 'slots', 'extract'])

/** One function serves every assistant route. The widget calls /api/assistant?route=. */
function assistantRoute(url: URL): string {
  if (url.pathname === '/api/assistant') {
    const route = url.searchParams.get('route') || ''
    if (ASSISTANT_ROUTES.has(route)) return `/api/${route}`
  }
  const nested = url.pathname.match(/^\/api\/assistant\/(chat|uploads|bill|lead|slots)$/)
  if (nested) return `/api/${nested[1]}`
  return url.pathname
}

function isBlankBill(fields: BillFields): boolean {
  return Object.values(fields).every(value => value == null)
}

export async function handleApi(request: Request): Promise<Response> {
  const url = requestUrl(request)
  try {
    const pathname = assistantRoute(url)
    if (pathname === '/api/chat' && request.method === 'POST') return await handleChat(request)
    if (pathname === '/api/uploads' && request.method === 'POST') return await handleUploads(request)
    if (pathname === '/api/bill' && request.method === 'POST') return await handleBill(request)
    if (pathname === '/api/lead' && request.method === 'POST') return await handleLead(request)
    if (pathname === '/api/slots' && request.method === 'GET') return await handleSlots(request)
    if (pathname === '/api/extract' && request.method === 'POST') return await handleExtract(request)
    return json({ error: 'Not found.' }, 404)
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    console.error('api_failed', error instanceof Error ? error.name : 'unknown')
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
