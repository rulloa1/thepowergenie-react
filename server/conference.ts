import { randomBytes } from 'node:crypto'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { assertSameOrigin, clientIp, HttpError, isRecord, json, readWebJson } from './http.js'
import { requireHubMember } from './hub-member.js'
import { enforceRateLimit } from './rate-limit.js'
import { insertReturning, patchRows, selectOne, selectRows } from './workflow/db.js'

const TEN_MINUTES = 10 * 60 * 1000
const ROOM_SECONDS = 8 * 60 * 60
const INVITE_TOKEN = /^[A-Za-z0-9_-]{32,80}$/
const CUSTOMER_ID = /^[A-Za-z0-9_-]{1,80}$/
const GUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RoomRow = {
  id: string
  customer_id: string
  invite_token: string
  livekit_room: string
  expires_at: string
  ended_at: string | null
}

type GuestRow = {
  id: string
  room_id: string
  display_name: string
  status: 'waiting' | 'admitted' | 'denied'
  wants_camera?: boolean | null
}

type CustomerRow = { id: string; customer_name: string | null }
type ProposalRow = { public_token: string }

export type LiveKitEnv = { url: string; apiKey: string; apiSecret: string }

/** Public project address. Not a secret. Override with LIVEKIT_URL if the project moves. */
export const LIVEKIT_URL_DEFAULT = 'wss://thepowergenie-conference-room-m4nzqnpy.livekit.cloud'

/** Server-only. The API secret never goes to the browser. */
export function livekitEnv(): LiveKitEnv | null {
  const url = process.env.LIVEKIT_URL?.trim() || LIVEKIT_URL_DEFAULT
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() || ''
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() || ''
  if (!apiKey || !apiSecret) return null
  if (!/^wss:\/\//.test(url)) return null
  return { url, apiKey, apiSecret }
}

export function livekitSetupError(): string {
  const url = process.env.LIVEKIT_URL?.trim() || LIVEKIT_URL_DEFAULT
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() || ''
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() || ''
  if (!apiKey || !apiSecret) {
    return `Video rooms need a LiveKit API key and secret. On Vercel, set LIVEKIT_API_KEY and LIVEKIT_API_SECRET, then redeploy. LIVEKIT_URL defaults to ${LIVEKIT_URL_DEFAULT}. Do not use a VITE_ name.`
  }
  return `LIVEKIT_URL must be a wss:// WebSocket URL. This project uses ${LIVEKIT_URL_DEFAULT}.`
}

export function newInviteToken(): string {
  return randomBytes(24).toString('base64url')
}

export function newRoomName(): string {
  return `pg-${randomBytes(16).toString('hex')}`
}

/** True when the guest wants their camera on as they enter. */
export function cameraChoice(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, 'Choose whether to use your camera.')
  return value
}

export function cleanGuestName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Enter your name to join.')
  const name = value.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  if (name.length < 1) throw new HttpError(400, 'Enter your name to join.')
  if (name.length > 40) throw new HttpError(400, 'Use a name of 40 characters or fewer.')
  return name
}

/** Camera, microphone, and screen share. Hosts can also admit people. */
export function participantGrant(room: string, isHost: boolean) {
  return {
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  }
}

export function invitePath(token: string): string {
  return `/room/${token}`
}

export function livekitHttpHost(url: string): string {
  return 'https://' + url.slice('wss://'.length).replace(/\/$/, '')
}

function notConfigured(): never {
  throw new HttpError(503, livekitSetupError())
}

async function mintToken(roomName: string, identity: string, name: string, isHost: boolean): Promise<string> {
  const env = livekitEnv()
  if (!env) notConfigured()
  const token = new AccessToken(env.apiKey, env.apiSecret, {
    identity,
    name,
    ttl: isHost ? '8h' : '2h',
  })
  token.addGrant(participantGrant(roomName, isHost))
  try {
    const jwt = await token.toJwt()
    if (typeof jwt !== 'string' || !jwt.includes('.')) {
      throw new Error('LiveKit did not return a token string')
    }
    return jwt
  } catch (error) {
    if (error instanceof HttpError) throw error
    const message = error instanceof Error ? error.message : 'token failed'
    console.error('livekit_token_failed', error instanceof Error ? error.name : 'unknown', message.slice(0, 180))
    throw new HttpError(502, 'LiveKit could not sign the join token. Check the API key and secret, then redeploy.')
  }
}

async function ensureRoom(roomName: string): Promise<void> {
  const env = livekitEnv()
  if (!env) notConfigured()
  const rooms = new RoomServiceClient(livekitHttpHost(env.url), env.apiKey, env.apiSecret)
  try {
    await rooms.createRoom({ name: roomName, emptyTimeout: 20 * 60, departureTimeout: 5 * 60, maxParticipants: 6 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/already exists/i.test(message)) return
    console.error('livekit_room_failed', error instanceof Error ? error.name : 'unknown')
    throw new HttpError(502, 'LiveKit could not open the room. Check the API key, secret, and URL.')
  }
}

async function customerOrThrow(customerId: string): Promise<CustomerRow> {
  if (!CUSTOMER_ID.test(customerId)) throw new HttpError(400, 'That customer is not on the hub.')
  const row = await selectOne<CustomerRow>('powergenie_customers', { id: `eq.${customerId}` }, 'id,customer_name')
  if (!row) throw new HttpError(404, 'That customer is not on the hub.')
  return row
}

async function proposalUrl(customerId: string, origin: string): Promise<string | null> {
  try {
    const rows = await selectRows<ProposalRow>(
      'hub_proposals',
      { lead_id: `eq.${customerId}`, status: 'in.(approved,sent)' },
      { select: 'public_token', order: 'updated_at.desc', limit: 1 },
    )
    const token = rows[0]?.public_token
    return token ? `${origin}/proposal/${token}` : null
  } catch {
    return null
  }
}

function originOf(url: URL): string {
  return url.origin.replace(/\/$/, '')
}

function missingTable(error: unknown): boolean {
  return error instanceof HttpError && error.status === 503
}

async function activeRoom(customerId: string): Promise<RoomRow | null> {
  const now = new Date().toISOString()
  try {
    const rows = await selectRows<RoomRow>(
      'hub_conference_rooms',
      { customer_id: `eq.${customerId}`, ended_at: 'is.null', expires_at: `gt.${now}` },
      { select: 'id,customer_id,invite_token,livekit_room,expires_at,ended_at', order: 'created_at.desc', limit: 1 },
    )
    return rows[0] ?? null
  } catch (error) {
    if (missingTable(error)) {
      throw new HttpError(503, 'Conference rooms need the hub_conference_rooms table. Apply the latest Supabase migration, then try again.')
    }
    throw error
  }
}

async function roomByInvite(token: string): Promise<RoomRow> {
  if (!INVITE_TOKEN.test(token)) throw new HttpError(404, 'That invite link is not valid.')
  let row: RoomRow | null
  try {
    row = await selectOne<RoomRow>(
      'hub_conference_rooms',
      { invite_token: `eq.${token}` },
      'id,customer_id,invite_token,livekit_room,expires_at,ended_at',
    )
  } catch (error) {
    if (missingTable(error)) throw new HttpError(503, 'Conference rooms are not set up in the database yet.')
    throw error
  }
  if (!row || row.ended_at) throw new HttpError(404, 'That invite link is not valid.')
  if (Date.parse(row.expires_at) <= Date.now()) throw new HttpError(410, 'This room has expired. Ask Horace or Rory for a new link.')
  return row
}

async function guestInRoom(room: RoomRow, guestId: string): Promise<GuestRow> {
  if (!GUEST_ID.test(guestId)) throw new HttpError(404, 'That invite link is not valid.')
  const row = await selectOne<GuestRow>(
    'hub_conference_guests',
    { id: `eq.${guestId}`, room_id: `eq.${room.id}` },
    'id,room_id,display_name,status,wants_camera',
  )
  if (!row) throw new HttpError(404, 'That invite link is not valid.')
  return row
}

function publicRoom(room: RoomRow, customerName: string, proposal: string | null) {
  return {
    customerName,
    expiresAt: room.expires_at,
    proposalUrl: proposal,
    invitePath: invitePath(room.invite_token),
  }
}

export async function handleConference(request: Request, url: URL): Promise<Response> {
  assertSameOrigin(request)
  const action = url.searchParams.get('action') || ''

  if (action === 'status' && request.method === 'GET') {
    await requireHubMember(request)
    return json({ configured: livekitEnv() !== null })
  }

  if (action === 'lobby' && request.method === 'GET') {
    enforceRateLimit(`conference-lobby:${clientIp(request)}`, 60, TEN_MINUTES)
    if (!livekitEnv()) notConfigured()
    const room = await roomByInvite(url.searchParams.get('token') || '')
    const customer = await customerOrThrow(room.customer_id)
    return json({
      customerName: customer.customer_name || 'your solar consult',
      expiresAt: room.expires_at,
      proposalUrl: await proposalUrl(room.customer_id, originOf(url)),
    })
  }

  if (action === 'knock' && request.method === 'POST') {
    enforceRateLimit(`conference-knock:${clientIp(request)}`, 12, TEN_MINUTES)
    if (!livekitEnv()) notConfigured()
    const body = await readWebJson(request, 4_000)
    if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
    const room = await roomByInvite(typeof body.token === 'string' ? body.token : '')
    const name = cleanGuestName(body.name)
    const wantsCamera = cameraChoice(body.camera)
    const waiting = await selectRows<GuestRow>(
      'hub_conference_guests',
      { room_id: `eq.${room.id}`, status: 'eq.waiting' },
      { select: 'id', limit: 8 },
    )
    if (waiting.length >= 8) throw new HttpError(429, 'Several people are already waiting. Ask the host to let someone in.')
    const inserted = await insertReturning<GuestRow>('hub_conference_guests', {
      room_id: room.id,
      display_name: name,
      status: 'waiting',
      wants_camera: wantsCamera,
    })
    if (!inserted) throw new HttpError(502, 'Could not join the waiting room.')
    return json({ guestId: inserted.id, status: 'waiting' as const, userName: name, camera: wantsCamera })
  }

  if (action === 'guest' && request.method === 'GET') {
    enforceRateLimit(`conference-guest:${clientIp(request)}`, 120, TEN_MINUTES)
    if (!livekitEnv()) notConfigured()
    const room = await roomByInvite(url.searchParams.get('token') || '')
    const guest = await guestInRoom(room, url.searchParams.get('guest') || '')
    if (guest.status === 'waiting') return json({ status: 'waiting' as const, camera: guest.wants_camera !== false })
    if (guest.status === 'denied') return json({ status: 'denied' as const })
    const env = livekitEnv()
    if (!env) notConfigured()
    const token = await mintToken(room.livekit_room, `guest-${guest.id}`, guest.display_name, false)
    const customer = await customerOrThrow(room.customer_id)
    return json({
      status: 'admitted' as const,
      serverUrl: env.url,
      token,
      userName: guest.display_name,
      startWithCamera: guest.wants_camera !== false,
      customerName: customer.customer_name || 'your solar consult',
      proposalUrl: await proposalUrl(room.customer_id, originOf(url)),
    })
  }

  if (action === 'camera' && request.method === 'POST') {
    enforceRateLimit(`conference-camera:${clientIp(request)}`, 30, TEN_MINUTES)
    if (!livekitEnv()) notConfigured()
    const body = await readWebJson(request, 4_000)
    if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
    const token = typeof body.token === 'string' ? body.token : ''
    const guestId = typeof body.guestId === 'string' ? body.guestId : ''
    const wantsCamera = cameraChoice(body.camera)
    const room = await roomByInvite(token)
    const guest = await guestInRoom(room, guestId)
    if (guest.status !== 'waiting') throw new HttpError(409, 'The host already answered. Your camera choice is locked in.')
    await patchRows('hub_conference_guests', { id: `eq.${guest.id}`, room_id: `eq.${room.id}` }, { wants_camera: wantsCamera })
    return json({ ok: true, camera: wantsCamera })
  }

  const member = await requireHubMember(request)
  if (!livekitEnv()) notConfigured()

  if (action === 'queue' && request.method === 'GET') {
    const customer = await customerOrThrow(url.searchParams.get('customerId') || '')
    const room = await activeRoom(customer.id)
    if (!room) return json({ guests: [], invitePath: null })
    const guests = await selectRows<GuestRow>(
      'hub_conference_guests',
      { room_id: `eq.${room.id}`, status: 'eq.waiting' },
      { select: 'id,display_name,status,wants_camera', order: 'created_at.asc', limit: 8 },
    )
    return json({
      invitePath: invitePath(room.invite_token),
      guests: guests.map((guest) => ({ id: guest.id, name: guest.display_name, camera: guest.wants_camera !== false })),
    })
  }

  if (request.method !== 'POST') throw new HttpError(404, 'Not found.')
  const body = await readWebJson(request, 4_000)
  if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
  if (typeof body.customerId !== 'string') throw new HttpError(400, 'Choose a customer first.')
  const customer = await customerOrThrow(body.customerId)

  if (action === 'admit' || action === 'decline') {
    const room = await activeRoom(customer.id)
    if (!room) throw new HttpError(404, 'Start a room before admitting someone.')
    const guestId = typeof body.guestId === 'string' ? body.guestId : ''
    const guest = await guestInRoom(room, guestId)
    if (guest.status !== 'waiting') return json({ ok: true, status: guest.status })
    const status = action === 'admit' ? 'admitted' : 'denied'
    await patchRows('hub_conference_guests', { id: `eq.${guest.id}`, room_id: `eq.${room.id}` }, { status })
    return json({ ok: true, status })
  }

  if (action !== 'start' && action !== 'host') throw new HttpError(404, 'Not found.')

  let room = await activeRoom(customer.id)
  if (!room && action === 'host') throw new HttpError(404, 'Start a room before joining as host.')
  if (!room) {
    const livekitRoom = newRoomName()
    await ensureRoom(livekitRoom)
    const exp = new Date(Date.now() + ROOM_SECONDS * 1000).toISOString()
    const inserted = await insertReturning<RoomRow>('hub_conference_rooms', {
      customer_id: customer.id,
      invite_token: newInviteToken(),
      livekit_room: livekitRoom,
      created_by: member.id,
      expires_at: exp,
    })
    if (!inserted) throw new HttpError(502, 'The room was created but not saved.')
    room = inserted
  } else {
    await ensureRoom(room.livekit_room)
  }

  const customerName = customer.customer_name || 'Customer'
  const shared = publicRoom(room, customerName, await proposalUrl(customer.id, originOf(url)))
  if (action === 'start') return json(shared)

  const hostName = member.fullName || member.email || 'Host'
  const env = livekitEnv()
  if (!env) notConfigured()
  const token = await mintToken(room.livekit_room, `host-${member.id}`, hostName, true)
  return json({ ...shared, serverUrl: env.url, token, userName: hostName })
}
