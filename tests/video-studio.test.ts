import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { handleVideoStudio } from '../server/video-studio'
import { exampleProject, parseProject, projectForSave, totalDuration } from '../src/video/model'

function request(body: unknown, suffix = '') {
  return new Request('http://localhost/api/video-studio', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': `video-test-${suffix}` }, body: JSON.stringify(body) })
}

test('project round-trip strips local object URLs and preserves completed remote media and pending tasks', () => {
  const p = structuredClone(exampleProject)
  p.scenes[0].media = 'blob:temporary'
  p.scenes[1].media = 'https://cdn.example.com/image.webp'
  p.scenes[2].taskId = 'pending-task'; p.scenes[2].taskKind = 'video'
  const loaded = parseProject(JSON.parse(JSON.stringify(projectForSave(p))))
  assert.equal(loaded.scenes[0].media, '')
  assert.equal(loaded.scenes[1].media, p.scenes[1].media)
  assert.equal(loaded.scenes[2].taskId, 'pending-task')
  assert.equal(totalDuration(loaded.scenes), 15)
  assert.equal('key' in loaded, false)
})

test('project import rejects malformed durations and strips executable or protocol-relative media URLs', () => {
  const p = structuredClone(exampleProject)
  p.scenes[0].duration = NaN
  assert.throws(() => parseProject(p), /durations/)
  p.scenes[0].duration = 5; p.scenes[0].media = 'javascript:alert(1)'; p.scenes[1].media = '//untrusted.example/image'
  const parsed = parseProject(p)
  assert.equal(parsed.scenes[0].media, '')
  assert.equal(parsed.scenes[1].media, '')
})

test('video API rejects cross-origin creation, missing keys, and unsupported methods before reaching providers', async () => {
  assert.equal((await handleVideoStudio(new Request('http://localhost/api/video-studio'))).status, 405)
  const crossOrigin = new Request(request({ action: 'image', key: 'test', prompt: 'sun' }), { headers: { origin: 'https://other.example' } })
  assert.equal((await handleVideoStudio(crossOrigin)).status, 403)
  const missing = await handleVideoStudio(request({ action: 'plan', idea: 'sun' }, 'missing'))
  assert.equal(missing.status, 400)
  assert.match((await missing.json()).error, /key/)
})

test('Flux task creation sends the configured ratio and returns a recoverable task ID', async () => {
  const stub = mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(url, 'https://api.piapi.ai/api/v1/task')
    assert.deepEqual(JSON.parse(options?.body as string), { model: 'Qubico/flux1-schnell', task_type: 'txt2img', input: { prompt: 'A bright solar roof', width: 576, height: 1024 } })
    return Response.json({ code: 200, data: { task_id: 'recoverable-task', status: 'pending', output: {} } })
  })
  try {
    const response = await handleVideoStudio(request({ action: 'image', key: 'not-a-real-key', prompt: 'A bright solar roof', ratio: '9:16' }, 'flux'))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).taskId, 'recoverable-task')
  } finally { stub.mock.restore() }
})

test('task polling supports current Kling output.video and surfaces failed tasks', async () => {
  let fail = false
  const stub = mock.method(globalThis, 'fetch', async () => Response.json({ code: 200, data: { task_id: 'clip-task', status: fail ? 'failed' : 'completed', output: { video: 'https://cdn.example.com/clip.mp4' } } }))
  try {
    const result = await handleVideoStudio(request({ action: 'task', key: 'test', taskId: 'clip-task' }, 'poll'))
    assert.equal((await result.json()).url, 'https://cdn.example.com/clip.mp4')
    fail = true
    const failure = await handleVideoStudio(request({ action: 'task', key: 'test', taskId: 'clip-task' }, 'poll-fail'))
    assert.equal((await failure.json()).failed, true)
  } finally { stub.mock.restore() }
})

test('provider errors never echo API keys or raw provider response bodies', async () => {
  const key = 'secret-should-never-echo'
  const stub = mock.method(globalThis, 'fetch', async () => Response.json({ message: key }, { status: 401 }))
  try {
    const result = await handleVideoStudio(request({ action: 'image', key, prompt: 'sun' }, 'redaction'))
    assert.equal(result.status, 502)
    const body = await result.text()
    assert.match(body, /rejected the API key/)
    assert.equal(body.includes(key), false)
  } finally { stub.mock.restore() }
})

test('OpenAI plans are validated before returning editable scenes', async () => {
  let invalid = false
  const stub = mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: JSON.stringify(invalid ? { title: 'bad', scenes: [] } : { title: 'Sunlight', scenes: Array.from({ length: 3 }, () => ({ caption: 'A bright beginning.', prompt: 'Golden sunlight over a city.' })) }) } }] }))
  try {
    const plan = await handleVideoStudio(request({ action: 'plan', key: 'test', idea: 'Sunlight at home', style: 'Cinematic' }, 'plan'))
    const body = await plan.json()
    assert.equal(plan.status, 200); assert.equal(body.scenes.length, 3); assert.equal(body.scenes[0].duration, 5); assert.equal(body.scenes[0].media, '')
    invalid = true
    assert.equal((await handleVideoStudio(request({ action: 'plan', key: 'test', idea: 'Sunlight', style: 'Cinematic' }, 'bad-plan'))).status, 502)
  } finally { stub.mock.restore() }
})

test('ElevenLabs audio returns binary content with no-store headers', async () => {
  const stub = mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([73, 68, 51]), { headers: { 'content-type': 'audio/mpeg' } }))
  try {
    const response = await handleVideoStudio(request({ action: 'voice', key: 'test', voiceId: 'voice123', narration: 'Hello sunlight.' }, 'voice'))
    assert.equal(response.headers.get('content-type'), 'audio/mpeg')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await response.arrayBuffer()).byteLength, 3)
  } finally { stub.mock.restore() }
})
