import { dimensions, totalDuration, type Project } from './model'

type Media = HTMLImageElement | HTMLVideoElement

async function loadMedia(url: string, kind: 'image' | 'video', signal: AbortSignal): Promise<Media> {
  return new Promise((resolve, reject) => {
    const element = kind === 'video' ? document.createElement('video') : new Image()
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const fail = (message: string) => { cleanup(); element.removeAttribute('src'); reject(new Error(message)) }
    const abort = () => fail('Export cancelled.')
    signal.addEventListener('abort', abort, { once: true })
    element.crossOrigin = 'anonymous'
    if (element instanceof HTMLVideoElement) { element.muted = true; element.playsInline = true; element.loop = true; element.preload = 'auto' }
    element.addEventListener(kind === 'video' ? 'loadeddata' : 'load', () => { cleanup(); resolve(element) }, { once: true })
    element.addEventListener('error', () => fail('A scene could not load. Download that media and upload it here, then export again.'), { once: true })
    timer = setTimeout(() => fail('Media loading timed out. Check the scene and try again.'), 25000)
    element.src = url
    if (signal.aborted) abort()
  })
}

function drawCover(ctx: CanvasRenderingContext2D, media: Media, width: number, height: number, progress: number) {
  const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
  const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
  const scale = Math.max(width / mw, height / mh) * (media instanceof HTMLVideoElement ? 1 : 1 + progress * 0.065)
  ctx.drawImage(media, (width - mw * scale) / 2, (height - mh * scale) / 2, mw * scale, mh * scale)
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, width: number, height: number) {
  const size = Math.round(width * 0.052)
  ctx.font = `600 ${size}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines: string[] = []
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1
    if (last >= 0 && ctx.measureText(`${lines[last]} ${word}`).width < width * 0.8) lines[last] += ` ${word}`
    else lines.push(word)
  }
  // Wrap an individual long word as well, keeping text inside the safe area.
  const safeLines: string[] = []
  for (const line of lines) {
    if (ctx.measureText(line).width <= width * 0.8) { safeLines.push(line); continue }
    let part = ''
    for (const letter of line) {
      if (ctx.measureText(part + letter).width > width * 0.8) { safeLines.push(part); part = letter } else part += letter
    }
    if (part) safeLines.push(part)
  }
  const visible = safeLines.slice(0, 6)
  const lineHeight = size * 1.35
  const top = height * 0.77 - visible.length * lineHeight / 2
  const gradient = ctx.createLinearGradient(0, height * 0.53, 0, height)
  gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, 'rgba(0,0,0,0.8)')
  ctx.fillStyle = gradient; ctx.fillRect(0, height * 0.53, width, height * 0.47)
  visible.forEach((line, i) => {
    const y = top + i * lineHeight
    ctx.lineWidth = size * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(line, width / 2, y)
    ctx.fillStyle = '#ffffff'; ctx.fillText(line, width / 2, y)
  })
}

/** Local real-time composition: media + burned-in captions + optional narration. */
export async function renderVideo(project: Project, audio: Blob | null, signal: AbortSignal, onProgress: (progress: number) => void): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('This browser cannot export video. Open Video Studio in current Chrome or Edge.')
  if (project.scenes.some(s => !s.media)) throw new Error('Add an image or clip to every scene before exporting.')
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('This browser has no supported video encoder. Try Chrome or Edge.')
  const media: Media[] = []
  let context: AudioContext | undefined
  let source: AudioBufferSourceNode | undefined
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  let frame = 0
  try {
    // Create/resume the audio context during the export button's user gesture.
    if (audio) { context = new AudioContext(); await context.resume() }
    for (const scene of project.scenes) {
      if (signal.aborted) throw new Error('Export cancelled.')
      media.push(await loadMedia(scene.media, scene.kind, signal))
    }
    const [width, height] = dimensions[project.ratio]
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')!
    drawCover(ctx, media[0], width, height, 0)
    if (project.captions) drawCaption(ctx, project.scenes[0].caption, width, height)
    stream = canvas.captureStream(30)
    let decoded: AudioBuffer | undefined
    if (audio && context) {
      decoded = await context.decodeAudioData(await audio.arrayBuffer())
      const duration = totalDuration(project.scenes)
      if (decoded.duration > duration + 0.3) throw new Error(`Narration is ${Math.ceil(decoded.duration)}s, but the video is ${duration}s. Increase scene durations or upload shorter narration.`)
      const destination = context.createMediaStreamDestination()
      source = context.createBufferSource(); source.buffer = decoded; source.connect(destination)
      destination.stream.getAudioTracks().forEach(track => stream!.addTrack(track))
    }
    const chunks: Blob[] = []
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder!.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }))
      recorder!.onerror = () => reject(new Error('Video encoding failed. Try exporting again.'))
    })
    // Attach rejection handling immediately; encoding errors can precede the animation loop's end.
    void stopped.catch(() => {})
    const duration = totalDuration(project.scenes)
    const boundaries = project.scenes.map((_, i) => totalDuration(project.scenes.slice(0, i + 1)))
    if (media[0] instanceof HTMLVideoElement) await media[0].play()
    recorder.start(250); source?.start()
    const start = performance.now()
    let active = 0
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal.aborted) { reject(new Error('Export cancelled.')); return }
        if (recorder?.state === 'inactive') { reject(new Error('Video encoding stopped unexpectedly.')); return }
        // A background tab can throttle capture. Fail explicitly instead of silently dropping scenes.
        if (document.hidden) { reject(new Error('Keep this tab visible during export. Return here and export again.')); return }
        const elapsed = (performance.now() - start) / 1000
        if (elapsed >= duration) { resolve(); return }
        const index = boundaries.findIndex(boundary => boundary > elapsed)
        if (index !== active) {
          const old = media[active]; if (old instanceof HTMLVideoElement) old.pause()
          active = index
          const next = media[active]
          if (next instanceof HTMLVideoElement) { next.currentTime = 0; void next.play().catch(() => reject(new Error('A clip could not play. Upload it again before exporting.'))) }
        }
        const scene = project.scenes[active]
        const sceneStart = active === 0 ? 0 : boundaries[active - 1]
        ctx.clearRect(0, 0, width, height)
        drawCover(ctx, media[active], width, height, (elapsed - sceneStart) / scene.duration)
        if (project.captions) drawCaption(ctx, scene.caption, width, height)
        onProgress(Math.round(elapsed / duration * 100))
        frame = requestAnimationFrame(tick)
      }
      tick()
    })
    recorder.stop()
    const blob = await stopped
    if (!blob.size) throw new Error('The video is empty. Try exporting again.')
    onProgress(100)
    return blob
  } finally {
    cancelAnimationFrame(frame)
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    try { source?.stop() } catch { /* source may not have started */ }
    stream?.getTracks().forEach(track => track.stop())
    await context?.close()
    for (const item of media) {
      if (item instanceof HTMLVideoElement) { item.pause(); item.removeAttribute('src'); item.load() }
    }
  }
}
