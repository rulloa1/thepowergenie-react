import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { AccessToken } from 'livekit-server-sdk'
import {
  cleanGuestName,
  invitePath,
  livekitEnv,
  livekitHttpHost,
  newInviteToken,
  newRoomName,
  participantGrant,
} from '../server/conference'
import { HttpError } from '../server/http'

test('invite links hide the LiveKit room name', () => {
  const token = newInviteToken()
  const room = newRoomName()
  assert.match(token, /^[A-Za-z0-9_-]{32}$/)
  assert.match(room, /^pg-[0-9a-f]{32}$/)
  assert.notEqual(token, newInviteToken())
  assert.equal(invitePath(token), `/room/${token}`)
  assert.equal(invitePath(token).includes(room), false)
  assert.equal(invitePath(token).includes('livekit'), false)
})

test('the host can admit people and everyone can publish camera, mic, and screen', () => {
  const host = participantGrant('pg-room', true)
  const guest = participantGrant('pg-room', false)
  assert.equal(host.roomAdmin, true)
  assert.equal(host.canPublish, true)
  assert.equal(host.canSubscribe, true)
  assert.equal(guest.roomAdmin, false)
  assert.equal(guest.canPublish, true)
  assert.equal(guest.room, 'pg-room')
})

test('a signed token does not contain the API secret', async () => {
  const secret = 'secretsecretsecretsecretsecret32'
  const token = new AccessToken('APItestkey', secret, { identity: 'guest-1', name: 'Alex Morgan', ttl: '10m' })
  token.addGrant(participantGrant('pg-room', false))
  const jwt = await token.toJwt()
  assert.equal(jwt.includes(secret), false)
  assert.equal(jwt.includes('APItestkey'), false)
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as {
    video?: { room?: string; roomAdmin?: boolean; roomJoin?: boolean; canPublish?: boolean }
  }
  assert.equal(payload.video?.room, 'pg-room')
  assert.equal(payload.video?.roomJoin, true)
  assert.equal(payload.video?.canPublish, true)
  assert.notEqual(payload.video?.roomAdmin, true)
})

test('guest names are trimmed and empty names are refused', () => {
  assert.equal(cleanGuestName('  Alex   Morgan '), 'Alex Morgan')
  assert.throws(() => cleanGuestName('   '), (error: unknown) => error instanceof HttpError && error.status === 400)
  assert.equal(cleanGuestName('A'.repeat(40)).length, 40)
})

test('the websocket URL becomes the LiveKit HTTPS host and missing keys stay off', () => {
  assert.equal(livekitHttpHost('wss://power-genie.livekit.cloud'), 'https://power-genie.livekit.cloud')
  const previous = {
    url: process.env.LIVEKIT_URL,
    key: process.env.LIVEKIT_API_KEY,
    secret: process.env.LIVEKIT_API_SECRET,
  }
  delete process.env.LIVEKIT_URL
  delete process.env.LIVEKIT_API_KEY
  delete process.env.LIVEKIT_API_SECRET
  assert.equal(livekitEnv(), null)
  process.env.LIVEKIT_API_KEY = 'key'
  process.env.LIVEKIT_API_SECRET = 'secret'
  assert.equal(livekitEnv()?.url, 'wss://thepowergenie-conference-room-m4nzqnpy.livekit.cloud')
  process.env.LIVEKIT_URL = 'https://not-a-websocket.example'
  assert.equal(livekitEnv(), null)
  if (previous.url === undefined) delete process.env.LIVEKIT_URL
  else process.env.LIVEKIT_URL = previous.url
  if (previous.key === undefined) delete process.env.LIVEKIT_API_KEY
  else process.env.LIVEKIT_API_KEY = previous.key
  if (previous.secret === undefined) delete process.env.LIVEKIT_API_SECRET
  else process.env.LIVEKIT_API_SECRET = previous.secret
})

test('the browser bundle does not mention the LiveKit secret', () => {
  const client = [
    'src/hub/conferenceApi.ts',
    'src/hub/ConferenceRoom.tsx',
    'src/pages/ConferenceJoinPage.tsx',
  ].map((file) => readFileSync(file, 'utf8')).join('\n')
  assert.equal(client.includes('LIVEKIT_API_SECRET='), false)
  assert.equal(client.includes('LIVEKIT_API_KEY='), false)
  assert.equal(client.includes('import.meta.env.LIVEKIT'), false)
  assert.match(readFileSync('server/conference.ts', 'utf8'), /LIVEKIT_API_SECRET/)
  assert.match(readFileSync('server/conference.ts', 'utf8'), /wss:\/\/thepowergenie-conference-room-m4nzqnpy\.livekit\.cloud/)
})
