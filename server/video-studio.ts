import { randomUUID } from 'node:crypto'
import { assertSameOrigin, clientIp, HttpError, isRecord, json, readWebJson } from './http.js'
import { enforceRateLimit } from './rate-limit.js'

function text(body: Record<string, unknown>, name: string, max: number): string {
  const value = body[name]
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, `Provide a valid ${name} (up to ${max} characters).`)
  return value.trim()
}

async function provider(url: string, init: RequestInit, name: string): Promise<Response> {
  let response: Response
  try { response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(45000) }) }
  catch { throw new HttpError(502, `${name} did not respond. Check your connection and try again. Do not resubmit a generation if a task ID was already returned.`) }
  if (!response.ok) {
    // Provider response bodies can echo requests, so never return or log them with user keys.
    const message = response.status === 401 || response.status === 403 ? 'rejected the API key or its permissions' : response.status === 429 ? 'is rate limited or has insufficient credits' : `returned status ${response.status}`
    throw new HttpError(502, `${name} ${message}. Check that account and try again.`)
  }
  return response
}

function piapiResult(value: unknown) {
  if (!isRecord(value) || !isRecord(value.data)) throw new HttpError(502, 'PiAPI returned an invalid task. Check your task history before trying again.')
  const data = value.data
  if (typeof value.code === 'number' && value.code !== 200) throw new HttpError(502, 'PiAPI rejected this task. Check your API account and task history.')
  const output = isRecord(data.output) ? data.output : {}
  const works = Array.isArray(output.works) ? output.works : []
  const first = isRecord(works[0]) ? works[0] : {}
  const url = [output.image_url, output.video, output.video_url, first.video?.toString()].find(v => typeof v === 'string' && v.startsWith('https://')) || ''
  return { taskId: data.task_id, status: data.status, url, failed: data.status === 'failed', error: data.status === 'failed' ? 'Generation failed at PiAPI. Check task history; you can retry this scene or upload media.' : null }
}

/** BYOK only: no deployment secrets, user keys, or media are persisted on this server. */
export async function handleVideoStudio(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, { allow: 'POST' })
    assertSameOrigin(request)
    const body = await readWebJson(request, 18000)
    if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
    const action = text(body, 'action', 20)
    enforceRateLimit(`video-studio:${action === 'task' ? 'poll' : 'create'}:${clientIp(request)}`, action === 'task' ? 240 : 30, 10 * 60 * 1000)
    if (!['plan', 'image', 'clip', 'task', 'voice'].includes(action)) throw new HttpError(400, 'Unknown video action.')
    const key = text(body, 'key', 512)
    if (/[\r\n]/.test(key)) throw new HttpError(400, 'Invalid API key.')
    const headers = { 'content-type': 'application/json' }
    if (action === 'plan') {
      const idea = text(body, 'idea', 2000)
      const style = text(body, 'style', 40)
      const response = await provider('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { ...headers, authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, max_tokens: 1800, messages: [
          { role: 'system', content: 'Write a cohesive short social-video storyboard. Output only JSON: {"title":string,"scenes":[{"caption":string,"prompt":string,"duration":5}]}. Exactly 3 scenes, each 5 seconds. Each spoken caption must be under 10 words. Prompts describe concrete visuals, coherent subjects, camera movement, lighting, and no on-screen text. Do not invent factual product claims, prices, or guarantees.' },
          { role: 'user', content: `Style: ${style}\nIdea: ${idea}` },
        ] }),
      }, 'OpenAI')
      const data = await response.json() as { choices?: { message?: { content?: string } }[] }
      let plan: unknown
      try { plan = JSON.parse(data.choices?.[0]?.message?.content || '') } catch { throw new HttpError(502, 'The storyboard could not be read. Try generating it again.') }
      if (!isRecord(plan) || typeof plan.title !== 'string' || !Array.isArray(plan.scenes) || plan.scenes.length !== 3) throw new HttpError(502, 'OpenAI returned an incomplete storyboard. Try again.')
      const scenes = plan.scenes.map((scene: unknown) => {
        if (!isRecord(scene) || typeof scene.caption !== 'string' || !scene.caption.trim() || scene.caption.length > 200 || typeof scene.prompt !== 'string' || !scene.prompt.trim() || scene.prompt.length > 2500) throw new HttpError(502, 'An AI scene was incomplete. Try again.')
        return { id: randomUUID(), caption: scene.caption, prompt: scene.prompt, duration: 5, media: '', kind: 'image' }
      })
      return json({ title: plan.title.slice(0, 120), scenes })
    }
    if (action === 'voice') {
      const narration = text(body, 'narration', 5000)
      const voiceId = text(body, 'voiceId', 80)
      if (!/^[a-zA-Z0-9_-]+$/.test(voiceId)) throw new HttpError(400, 'Use a valid ElevenLabs voice ID.')
      const response = await provider(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { ...headers, 'xi-api-key': key }, body: JSON.stringify({ text: narration, model_id: 'eleven_multilingual_v2' }),
      }, 'ElevenLabs')
      return new Response(await response.arrayBuffer(), { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
    }
    const piapiHeaders = { ...headers, 'x-api-key': key }
    if (action === 'task') {
      const taskId = text(body, 'taskId', 100)
      if (!/^[\w-]+$/.test(taskId)) throw new HttpError(400, 'Invalid task ID.')
      const response = await provider(`https://api.piapi.ai/api/v1/task/${taskId}`, { headers: piapiHeaders }, 'PiAPI')
      return json(piapiResult(await response.json()))
    }
    const prompt = text(body, 'prompt', 2500)
    const ratio = body.ratio === '16:9' || body.ratio === '1:1' ? body.ratio : '9:16'
    let payload: unknown
    if (action === 'image') {
      const [width, height] = ratio === '9:16' ? [576, 1024] : ratio === '16:9' ? [1024, 576] : [1024, 1024]
      payload = { model: 'Qubico/flux1-schnell', task_type: 'txt2img', input: { prompt, width, height } }
    } else {
      const imageUrl = text(body, 'imageUrl', 3000)
      let url: URL
      try { url = new URL(imageUrl) } catch { throw new HttpError(400, 'Generate a Flux image first. Kling requires a publicly accessible image URL.') }
      if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname) || !url.hostname.includes('.')) throw new HttpError(400, 'Kling requires a public HTTPS image URL.')
      payload = { model: 'kling', task_type: 'video_generation', input: { prompt, image_url: imageUrl, duration: 5, version: '2.6', mode: 'std', aspect_ratio: ratio }, config: { service_mode: 'public' } }
    }
    const response = await provider('https://api.piapi.ai/api/v1/task', { method: 'POST', headers: piapiHeaders, body: JSON.stringify(payload) }, 'PiAPI')
    return json(piapiResult(await response.json()))
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    return json({ error: 'The video request could not be completed. Try again.' }, 500)
  }
}
