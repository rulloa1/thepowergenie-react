import { randomUUID } from 'node:crypto'
import { handleVideoStudio } from './video-studio.js'
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
import { requireHubMember } from './hub-member.js'
import { notifyPageVisit } from './notify.js'
import { inviteDashboardMember } from './admin-invite.js'
import { handleProposalPage, handleWorkflow } from './workflow/routes.js'
import { handleConference } from './conference.js'
import { handleHubAccess } from './hub-access.js'
import { handleTeslaLive, handleTeslaHistory } from './tesla.js'
import { handleSequenceStatus, handleSequenceStart, handleSequencePause, handleSequenceResume, handleUnsubscribe } from './sequence.js'

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
 * This is the same extractor the assistant uses. HEIC/HEIF is converted to JPEG
 * for the model only. The temp object is deleted here; the caller's original is not.
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
    if (!sniffed) return json({ fields: EMPTY_BILL, warning: 'unreadable' })
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

/**
 * Signed-in hub members can read a light bill with the same extractor the
 * website assistant uses. The bytes come from the member; this route does
 * not accept a storage path, so it cannot pull an existing private object.
 * Saving the lead stays on RLS in the browser.
 */
export async function handleHubBill(request: Request): Promise<Response> {
  assertSameOrigin(request)
  const member = await requireHubMember(request)
  enforceRateLimit(`hub-bill:${member.id}`, 20, TEN_MINUTES)
  const body = await readWebJson(request, 16_000_000)
  if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
  const fileName = typeof body.fileName === 'string' ? body.fileName : 'light-bill'
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  if (!dataBase64) throw new HttpError(400, 'Attach the bill again.')
  if (dataBase64.length > 14_000_000) throw new HttpError(413, 'That file is over 10 MB. Try a photo or a smaller PDF.')
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(Buffer.from(dataBase64, 'base64'))
  } catch {
    throw new HttpError(400, 'Attach the bill again.')
  }
  const declared = assertAllowedUpload(fileName, mimeType, bytes.byteLength)
  const sniffed = assertBillBytes(bytes, declared)
  const fields = await extractBill(bytes, sniffed)
  const warning = isBlankBill(fields)
    ? 'I could not read that automatically. You can type the details below, and the file can still be attached.'
    : null
  return json({ fields, warning })
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

export async function handleVisit(request: Request): Promise<Response> {
  const ip = clientIp(request)
  // Limit to 3 visit alerts per IP per 10 minutes so rapid navigation doesn't spam
  enforceRateLimit(`visit:${ip}`, 3, TEN_MINUTES)
  const body = await readWebJson(request, 4000).catch(() => ({}))
  const page = isRecord(body) && typeof body.page === 'string' && body.page.trim() ? body.page.trim().slice(0, 80) : '/book'
  await notifyPageVisit(page, ip)
  return json({ ok: true })
}

export async function handleInvite(request: Request): Promise<Response> {
  const url = requestUrl(request)
  const secret = process.env.EXTRACT_SHARED_SECRET?.trim()
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const adminKey = url.searchParams.get('admin_key')
  const configuredAdminKey = process.env.ADMIN_INVITE_KEY?.trim()
  const authorized = (secret && token === secret) || (configuredAdminKey && adminKey === configuredAdminKey)
  if (!authorized) throw new HttpError(401, 'Unauthorized.')
  const body = await readWebJson(request, 8000)
  if (!isRecord(body) || typeof body.email !== 'string') throw new HttpError(400, 'Invalid request.')
  const result = await inviteDashboardMember({
    email: body.email,
    phone: typeof body.phone === 'string' ? body.phone : undefined,
    name: typeof body.name === 'string' ? body.name : 'Team Member',
    temporaryPassword: typeof body.temporaryPassword === 'string' ? body.temporaryPassword : undefined,
    role: body.role === 'owner' ? 'owner' : 'admin',
  })
  return json(result)
}


/** One function serves every assistant route. The widget calls /api/assistant?route=. */
const ASSISTANT_ROUTES = new Set(['chat', 'uploads', 'bill', 'lead', 'slots', 'extract', 'hub-bill', 'visit', 'invite', 'workflow', 'proposal', 'conference', 'hub-access', 'video-studio'])

function assistantRoute(url: URL): string {
  if (url.pathname === '/api/assistant') {
    const route = url.searchParams.get('route') || ''
    if (ASSISTANT_ROUTES.has(route)) return `/api/${route}`
  }
  const nested = url.pathname.match(/^\/api\/assistant\/(chat|uploads|bill|lead|slots|visit|invite)$/)
  if (nested) return `/api/${nested[1]}`
  return url.pathname
}

function isBlankBill(fields: BillFields): boolean {
  return Object.values(fields).every(value => value == null)
}

function scrubLog(text: string): string {
  return text
    .replace(/sb_secret_[A-Za-z0-9._-]+/g, 'sb_secret_[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
}

/** Name alone hid the TypeError. Message and stack stay, secrets do not. */
export function logApiFailure(error: unknown): void {
  const err = error instanceof Error ? error : new Error('unknown')
  const message = scrubLog(err.message).slice(0, 400)
  console.error('api_failed', err.name, message)
  const stack = scrubLog(err.stack || '').split('\n').slice(0, 12).join('\n')
  if (stack) console.error(stack)
}

export async function handleApi(request: Request): Promise<Response> {
  const url = requestUrl(request)
  try {
    const pathname = assistantRoute(url)
    if (pathname === '/api/hub-access' && request.method === 'POST') {
      guard(request, 'hub-access', 10, TEN_MINUTES)
      return await handleHubAccess(request)
    }
    if (pathname === '/api/video-studio') return await handleVideoStudio(request)
    if (pathname === '/api/chat' && request.method === 'POST') return await handleChat(request)
    if (pathname === '/api/uploads' && request.method === 'POST') return await handleUploads(request)
    if (pathname === '/api/bill' && request.method === 'POST') return await handleBill(request)
    if (pathname === '/api/lead' && request.method === 'POST') return await handleLead(request)
    if (pathname === '/api/slots' && request.method === 'GET') return await handleSlots(request)
    if (pathname === '/api/extract' && request.method === 'POST') return await handleExtract(request)
    if (pathname === '/api/hub-bill' && request.method === 'POST') return await handleHubBill(request)
    if (pathname === '/api/visit' && request.method === 'POST') return await handleVisit(request)
    if (pathname === '/api/invite' && request.method === 'POST') return await handleInvite(request)
    if (pathname === '/api/workflow') return await handleWorkflow(request, url)
    if (pathname === '/api/conference') return await handleConference(request, url)
    if (pathname === '/api/proposal' && (request.method === 'GET' || request.method === 'POST')) return await handleProposalPage(request, url)
    if (pathname === '/api/tesla/live' && request.method === 'GET') return handleTeslaLive(request)
    if (pathname === '/api/tesla/history' && request.method === 'GET') return handleTeslaHistory()
    // Sequence management routes
    if (pathname === '/api/sequence' && request.method === 'GET') return await handleSequenceStatus(request)
    if (pathname === '/api/sequence/start' && request.method === 'POST') return await handleSequenceStart(request)
    if (pathname === '/api/sequence/pause' && request.method === 'POST') return await handleSequencePause(request)
    if (pathname === '/api/sequence/resume' && request.method === 'POST') return await handleSequenceResume(request)
    // Public unsubscribe (no auth)
    if (url.pathname === '/unsubscribe' || url.pathname.startsWith('/unsubscribe/')) {
      const token = url.pathname.split('/')[2] || url.searchParams.get('token')
      if (token) {
        const unsubUrl = new URL(request.url)
        unsubUrl.searchParams.set('token', token)
        return await handleUnsubscribe(new Request(unsubUrl, request))
      }
    }
    return json({ error: 'Not found.' }, 404)
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    logApiFailure(error)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
