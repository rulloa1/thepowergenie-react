import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Clapperboard, Film, ImagePlus, KeyRound, LoaderCircle, Mic, Pause, Play, Plus, RotateCcw, Save, Settings2, Sparkles, Trash2, Upload, Volume2, X } from 'lucide-react'
import { dimensions, exampleProject, localStoryboard, parseProject, projectForSave, totalDuration, type Project, type Scene } from './model'
import { renderVideo } from './render'
import './video-studio.css'

type Keys = { openai: string; piapi: string; elevenlabs: string; voiceId: string }
type TaskResult = { taskId: string; status: string; url: string; failed: boolean; error?: string }
const initialKeys: Keys = { openai: '', piapi: '', elevenlabs: '', voiceId: 'JBFqnCBsd6RMkjVDRZzb' }
const storageKey = 'powergenie.video-studio.v1'

function readProject(): Project {
  try { const saved = localStorage.getItem(storageKey); if (saved) return parseProject(JSON.parse(saved)) } catch { /* Start with the example if browser storage is unavailable. */ }
  return structuredClone(exampleProject)
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

export default function VideoStudio() {
  const [project, setProject] = useState<Project>(readProject)
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState<'storyboard' | 'voice' | 'export'>('storyboard')
  const [mode, setMode] = useState<'ai' | 'local'>('ai')
  const [keys, setKeys] = useState<Keys>(initialKeys)
  const [connections, setConnections] = useState(false)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [audio, setAudio] = useState<{ blob: Blob; url: string; name: string; duration: number } | null>(null)
  const [output, setOutput] = useState<{ blob: Blob; url: string } | null>(null)
  const [narration, setNarration] = useState('')
  const [customNarration, setCustomNarration] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const localUrls = useRef(new Set<string>())
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const connectionRef = useRef<HTMLHeadingElement>(null)
  const latestProject = useRef(project)
  latestProject.current = project
  const scene = project.scenes[selected] || project.scenes[0]
  const duration = totalDuration(project.scenes)
  const ready = project.scenes.filter(s => s.media).length
  const spokenText = customNarration ? narration : project.scenes.map(s => s.caption).join(' ')
  const [width, height] = dimensions[project.ratio]
  const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70) || 'my-video'

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(projectForSave(project))) } catch { /* Export project remains available. */ }
    setPlaying(false); setPlayhead(0); setOutput(null)
  }, [project])
  useEffect(() => { if (connections) connectionRef.current?.focus() }, [connections])
  useEffect(() => () => { controller.current?.abort(); localUrls.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  useEffect(() => () => { if (output) URL.revokeObjectURL(output.url) }, [output])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url) }, [audio])
  useEffect(() => { setOutput(null) }, [audio])

  useEffect(() => {
    if (!playing) { videoRef.current?.pause(); audioRef.current?.pause(); return }
    const offset = playhead
    const start = performance.now()
    let frame = 0
    const tick = () => {
      const elapsed = offset + (performance.now() - start) / 1000
      if (elapsed >= duration) { setPlaying(false); setPlayhead(0); setSelected(0); if (audioRef.current) audioRef.current.currentTime = 0; return }
      setPlayhead(elapsed)
      let boundary = 0
      const index = project.scenes.findIndex(s => { boundary += s.duration; return elapsed < boundary })
      setSelected(Math.max(0, index))
      frame = requestAnimationFrame(tick)
    }
    if (audioRef.current) { audioRef.current.currentTime = offset; void audioRef.current.play().catch(() => { setPlaying(false); setError('Narration could not play. Upload a supported MP3 or WAV file.') }) }
    tick()
    return () => cancelAnimationFrame(frame)
    // Restart only when playback is toggled; playhead updates on each animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration, project.scenes])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      const start = totalDuration(project.scenes.slice(0, selected))
      const sync = () => { video.currentTime = Math.max(0, playhead - start) % (video.duration || scene.duration); void video.play().catch(() => { setPlaying(false); setError('This clip cannot play. Try uploading it again.') }) }
      if (video.readyState >= 2) sync(); else video.addEventListener('loadeddata', sync, { once: true })
      return () => video.removeEventListener('loadeddata', sync)
    }
    video.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, playing, scene.media])

  function updateScene(id: string, patch: Partial<Scene>) {
    setProject(p => ({ ...p, scenes: p.scenes.map(s => s.id === id ? { ...s, ...patch } : s) }))
  }

  async function api<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch('/api/video-studio', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'The video service is unavailable. Run the app with npm run dev, or check its deployment.') }
    if (body.action === 'voice') return await response.blob() as T
    return await response.json() as T
  }

  async function run(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return
    const abort = new AbortController(); controller.current = abort
    setBusy(label); setError(''); setMessage(''); setPlaying(false)
    try { await action(abort.signal) }
    catch (e) { setError(abort.signal.aborted ? 'Stopped. Any submitted AI task may still finish in your provider account. Use Resume task instead of submitting it again.' : e instanceof Error ? e.message : 'Something went wrong. Try again.') }
    finally { setBusy(''); controller.current = null }
  }

  function requireKey(provider: keyof Keys) {
    if (keys[provider].trim()) return true
    setConnections(true); setError(`Add your ${provider === 'piapi' ? 'PiAPI' : provider === 'openai' ? 'OpenAI' : 'ElevenLabs'} API key in Connections first.`)
    return false
  }

  async function waitForTask(task: TaskResult, target: Scene, kind: 'image' | 'video', signal: AbortSignal) {
    if (!task.taskId) throw new Error('No task ID was returned. Check PiAPI task history before resubmitting.')
    updateScene(target.id, { taskId: task.taskId, taskKind: kind })
    let result = task
    // Browser polling survives serverless request limits; IDs are saved for resuming after a reload.
    for (let i = 0; i < 120; i++) {
      if (result.failed) { updateScene(target.id, { taskId: undefined, taskKind: undefined }); throw new Error(result.error || 'PiAPI generation failed. Retry this scene or upload media.') }
      if (result.status === 'completed' && result.url) {
        updateScene(target.id, { media: result.url, kind, taskId: undefined, taskKind: undefined })
        return
      }
      if (result.status === 'completed') throw new Error(`Task ${task.taskId} finished without a usable media URL. Check the task in PiAPI.`)
      setMessage(`${kind === 'image' ? 'Flux is composing your image' : 'Kling is animating your scene'}. Task ${task.taskId}. This can take a few minutes.`)
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 5000)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
      result = await api<TaskResult>({ action: 'task', key: keys.piapi, taskId: task.taskId }, signal)
    }
    throw new Error('Generation is still running. The task ID is saved; use Resume task to check it without another charge.')
  }

  function generateScene(target: Scene, kind: 'image' | 'video') {
    if (!requireKey('piapi')) return
    if (target.taskId) { resumeTask(target); return }
    if (kind === 'video' && !target.media.startsWith('https://')) { setError('Generate a Flux image first. Kling needs a public image URL; uploaded local files can still be exported as animated stills.'); return }
    void run(kind === 'image' ? 'Generating image' : 'Animating scene', async signal => {
      const task = await api<TaskResult>({ action: kind === 'image' ? 'image' : 'clip', key: keys.piapi, prompt: `${target.prompt} Visual style: ${project.style}.`, ratio: project.ratio, imageUrl: target.media }, signal)
      await waitForTask(task, target, kind, signal)
      setMessage(kind === 'image' ? 'Image ready. You can animate it or export it as a moving still.' : 'Clip ready. Preview it on the right.')
    })
  }

  function resumeTask(target: Scene) {
    if (!requireKey('piapi') || !target.taskId) return
    void run('Checking saved task', async signal => {
      const task = await api<TaskResult>({ action: 'task', key: keys.piapi, taskId: target.taskId }, signal)
      await waitForTask(task, target, target.taskKind || 'image', signal)
      setMessage('Your saved task is complete.')
    })
  }

  function buildStoryboard() {
    if (!project.idea.trim()) { setError('Describe your video idea first.'); return }
    if (mode === 'ai' && !requireKey('openai')) return
    void run('Building storyboard', async signal => {
      const result = mode === 'ai'
        ? await api<{ title: string; scenes: Scene[] }>({ action: 'plan', key: keys.openai, idea: project.idea, style: project.style }, signal)
        : { title: project.idea.split(/[.!?]/)[0].slice(0, 65), scenes: localStoryboard(project.idea) }
      setProject(p => ({ ...p, title: result.title, scenes: result.scenes })); setSelected(0); setAudio(null); setCustomNarration(false)
      setMessage(mode === 'ai' ? 'Storyboard ready. Edit your captions and prompts, then generate or upload your visuals.' : 'Local outline created. Edit the suggested scenes and upload your images or clips.')
    })
  }

  async function attachAudio(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const element = new Audio()
    try {
      const seconds = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Narration could not load. Try an MP3 or WAV file.')), 15000)
        element.onloadedmetadata = () => { clearTimeout(timer); resolve(element.duration) }
        element.onerror = () => { clearTimeout(timer); reject(new Error('Narration could not load. Try an MP3 or WAV file.')) }
        element.src = url
      })
      if (!Number.isFinite(seconds)) throw new Error('This audio has no readable duration. Try an MP3 or WAV file.')
      setAudio({ blob, url, name, duration: seconds })
    } catch (e) { URL.revokeObjectURL(url); throw e }
    finally { element.removeAttribute('src'); element.load() }
  }

  function uploadMedia(file?: File) {
    if (!file) return
    if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/.test(file.type)) { setError('Upload a JPG, PNG, WebP, MP4, or WebM file.'); return }
    if (file.size > 150 * 1024 * 1024) { setError('Choose a scene file smaller than 150 MB.'); return }
    const url = URL.createObjectURL(file); localUrls.current.add(url)
    updateScene(scene.id, { media: url, kind: file.type.startsWith('video') ? 'video' : 'image', taskId: undefined, taskKind: undefined })
    setMessage(`${file.name} added. Local files stay in this tab; upload them again after a reload.`); setError('')
  }

  function selectScene(index: number) { setPlaying(false); setSelected(index); setPlayhead(totalDuration(project.scenes.slice(0, index))) }
  function moveScene(delta: number) {
    const next = selected + delta
    if (next < 0 || next >= project.scenes.length) return
    setProject(p => { const scenes = [...p.scenes]; [scenes[selected], scenes[next]] = [scenes[next], scenes[selected]]; return { ...p, scenes } }); setSelected(next)
  }

  function exportVideo() {
    setProgress(0)
    void run('Rendering your video', async signal => {
      const blob = await renderVideo(project, audio?.blob || null, signal, setProgress)
      setOutput({ blob, url: URL.createObjectURL(blob) }); setMessage('Your video is ready. Play it below or download the file.'); setTab('export')
    })
  }

  function exportCaptions() {
    const timestamp = (seconds: number) => `${time(seconds)}:00`.replace(/^(\d\d):(\d\d):00$/, '00:$1:$2,000')
    let elapsed = 0
    const srt = project.scenes.map((s, i) => { const start = elapsed; elapsed += s.duration; return `${i + 1}\n${timestamp(start)} --> ${timestamp(elapsed)}\n${s.caption}\n` }).join('\n')
    download(new Blob([srt], { type: 'text/plain' }), `${slug}.srt`)
  }

  return <div className="vs-app">
    <header className="vs-header">
      <a className="vs-brand" href="/" aria-label="Power Genie home"><Clapperboard size={24} /><span>Video Studio<span className="vs-brand-by">by Power Genie</span></span></a>
      <div className="vs-project-name"><span className="vs-dot" />{project.title}<span className="vs-draft">Draft</span></div>
      <div className="vs-header-actions"><button aria-label="Save project" className="vs-button vs-quiet" onClick={() => { download(new Blob([JSON.stringify(projectForSave(project), null, 2)], { type: 'application/json' }), `${slug}.json`); setMessage('Project saved. Local uploads and narration are not embedded; reattach them when reopening.') }} disabled={!!busy}><Save size={16} /><span>Save project</span></button><button aria-label="Connections" className={`vs-button ${connections ? 'vs-selected' : ''}`} onClick={() => setConnections(v => !v)} aria-expanded={connections}><Settings2 size={16} /><span>Connections</span></button></div>
    </header>

    <main className="vs-main">
      <div className="vs-heading"><div><h1>From a spark to a short.</h1><p>Your idea. Your scenes. One finished video.</p></div><label className="vs-mode">Creation mode<select value={mode} disabled={!!busy} onChange={e => setMode(e.target.value as typeof mode)}><option value="ai">AI generation</option><option value="local">Local creation</option></select><ChevronDown size={14} /></label></div>

      <ol className="vs-pipeline" aria-label="Video creation pipeline">
        {[
          { title: 'Idea & script', tool: mode === 'ai' ? 'OpenAI' : 'Your outline', done: project.scenes.length > 0, icon: Sparkles },
          { title: 'Scene images', tool: 'Flux / Upload', done: ready === project.scenes.length, icon: ImagePlus },
          { title: 'Motion', tool: 'Kling / Moving stills', done: project.scenes.some(s => s.kind === 'video'), icon: Film },
          { title: 'Voiceover', tool: audio ? 'Narration attached' : 'ElevenLabs / Upload', done: !!audio, icon: Mic },
          { title: 'Final video', tool: 'Local render', done: !!output, icon: Clapperboard },
        ].map((step, i) => <li key={step.title} className={step.done ? 'vs-step-done' : ''}><span className={`vs-step-icon vs-stage-${i}`}><step.icon size={17} /></span><span><strong>{step.title}</strong><small>{step.tool}</small></span>{step.done && <Check size={14} className="vs-step-check" />}</li>)}
      </ol>

      {connections && <section className="vs-connections" aria-label="API connections"><div className="vs-section-top"><div><h2 tabIndex={-1} ref={connectionRef}>Connect your creative tools</h2><p>Keys stay in memory for this tab. Generation uses your provider credits; local preview and export are free.</p></div><button className="vs-icon-button" aria-label="Close connections" onClick={() => setConnections(false)}><X size={18} /></button></div><div className="vs-key-grid">{([{ field: 'openai', label: 'OpenAI API key', hint: 'Scripts & scene prompts', href: 'https://platform.openai.com/api-keys' }, { field: 'piapi', label: 'PiAPI API key', hint: 'Flux images & Kling clips', href: 'https://piapi.ai/workspace' }, { field: 'elevenlabs', label: 'ElevenLabs API key', hint: 'Natural voiceover', href: 'https://elevenlabs.io/app/settings/api-keys' }] as const).map(item => <label key={item.field}><span>{item.label}<a href={item.href} target="_blank" rel="noreferrer">Get key <ArrowRight size={12} /></a></span><input type="password" autoComplete="off" value={keys[item.field]} onChange={e => setKeys(k => ({ ...k, [item.field]: e.target.value }))} placeholder="Paste your API key" disabled={!!busy} /><small>{item.hint}{keys[item.field] ? ' · Key entered (not yet verified)' : ''}</small></label>)}</div><div className="vs-connection-footer"><KeyRound size={14} /><span>Keys are sent only to this app’s server and the selected provider.</span><button className="vs-text-button" disabled={!!busy} onClick={() => { setKeys(initialKeys); setMessage('Session API keys cleared.') }}>Clear keys</button></div></section>}

      <div className="vs-notices" aria-live="polite">{error && <div className="vs-notice vs-error" role="alert"><span>{error}</span><button className="vs-icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}{message && <div className="vs-notice"><span>{message}</span><button className="vs-icon-button" aria-label="Dismiss message" onClick={() => setMessage('')}><X size={16} /></button></div>}{busy && <div className="vs-busy" role="status"><LoaderCircle className="vs-spin" size={17} /><strong>{busy}{busy === 'Rendering your video' ? ` · ${progress}%` : '…'}</strong><button className="vs-text-button" onClick={() => controller.current?.abort()}>Stop</button>{busy === 'Rendering your video' && <progress max={100} value={progress} aria-label="Render progress" />}</div>}</div>

      <div className="vs-workspace">
        <section className="vs-editor" aria-label="Video editor">
          <section className="vs-idea"><div className="vs-section-top"><h2>What’s the story?</h2><span className="vs-hint">Start with an idea</span></div><label className="vs-sr" htmlFor="vs-idea">Video idea</label><textarea id="vs-idea" value={project.idea} maxLength={2000} onChange={e => setProject(p => ({ ...p, idea: e.target.value }))} placeholder="A place, a product, a story worth telling…" disabled={!!busy} rows={3} /><div className="vs-idea-controls"><label>Visual style<select value={project.style} disabled={!!busy} onChange={e => setProject(p => ({ ...p, style: e.target.value }))}>{['Cinematic', 'Documentary', 'Editorial', '3D animation', 'Photorealistic'].map(s => <option key={s}>{s}</option>)}</select></label><button className="vs-button vs-primary" disabled={!!busy || !project.idea.trim()} onClick={buildStoryboard}><Sparkles size={16} />Build storyboard<ArrowRight size={16} /></button></div><p className="vs-help">{mode === 'ai' ? 'Creates 3 editable scenes with OpenAI. Replaces the current storyboard.' : 'Creates a simple editable outline. Add your own media to each scene.'}</p></section>

          <div className="vs-tabs" role="tablist" aria-label="Editor panels">{(['storyboard', 'voice', 'export'] as const).map(t => <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} tabIndex={tab === t ? 0 : -1} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const tabs = ['storyboard', 'voice', 'export'] as const; const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; setTab(next); document.getElementById(`tab-${next}`)?.focus() } }} onClick={() => setTab(t)}>{t === 'storyboard' ? 'Storyboard' : t === 'voice' ? 'Voiceover' : 'Export'}{t === 'storyboard' && <span>{project.scenes.length}</span>}</button>)}</div>

          {tab === 'storyboard' && <div className="vs-panel" role="tabpanel" id="panel-storyboard" aria-labelledby="tab-storyboard"><div className="vs-scene-strip" aria-label="Scenes">{project.scenes.map((s, i) => <button key={s.id} className={`vs-scene-thumb ${selected === i ? 'vs-active' : ''}`} onClick={() => selectScene(i)} aria-label={`Edit scene ${i + 1}: ${s.caption}`} aria-pressed={selected === i}>{s.media ? s.kind === 'video' ? <video src={s.media} muted preload="metadata" /> : <img src={s.media} alt="" /> : <ImagePlus size={22} />}<span>Scene {i + 1}<small>{s.duration}s</small></span></button>)}<button className="vs-add-scene" aria-label="Add scene" disabled={!!busy || project.scenes.length >= 12} onClick={() => { setSelected(project.scenes.length); setProject(p => ({ ...p, scenes: [...p.scenes, { id: crypto.randomUUID(), caption: '', prompt: '', duration: 5, media: '', kind: 'image' }] })) }}><Plus size={20} /><span>Add</span></button></div><div className="vs-scene-editor" id="vs-scene-editor"><a className="vs-mobile-preview-link" href="#vs-preview"><Play size={14} />Preview scene {selected + 1}<ArrowRight size={14} /></a><div className="vs-section-top"><h3>Scene {selected + 1}<span>{time(totalDuration(project.scenes.slice(0, selected)))} — {time(totalDuration(project.scenes.slice(0, selected + 1)))}</span></h3><div className="vs-scene-actions"><button className="vs-icon-button" aria-label="Move scene earlier" disabled={!!busy || selected === 0} onClick={() => moveScene(-1)}><ArrowLeft size={16} /></button><button className="vs-icon-button" aria-label="Move scene later" disabled={!!busy || selected === project.scenes.length - 1} onClick={() => moveScene(1)}><ArrowRight size={16} /></button><button className="vs-icon-button" aria-label="Delete scene" disabled={!!busy || project.scenes.length <= 1} onClick={() => { setProject(p => ({ ...p, scenes: p.scenes.filter(s => s.id !== scene.id) })); setSelected(Math.max(0, selected - 1)) }}><Trash2 size={16} /></button></div></div><label className="vs-field">Caption & narration<textarea value={scene.caption} maxLength={600} rows={2} onChange={e => updateScene(scene.id, { caption: e.target.value })} disabled={!!busy} placeholder="What should the audience hear and read?" /></label><label className="vs-field">Visual prompt<textarea value={scene.prompt} maxLength={2500} rows={3} onChange={e => updateScene(scene.id, { prompt: e.target.value })} disabled={!!busy} placeholder="Describe the subject, setting, light, and camera movement." /></label><div className="vs-scene-controls"><label>Duration<select value={scene.duration} onChange={e => updateScene(scene.id, { duration: Number(e.target.value) })} disabled={!!busy}>{[3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><div><label className={`vs-button vs-upload ${busy ? 'vs-disabled' : ''}`}><Upload size={15} />Upload media<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" disabled={!!busy} onChange={e => { uploadMedia(e.target.files?.[0]); e.target.value = '' }} /></label>{scene.taskId ? <button className="vs-button" disabled={!!busy} onClick={() => resumeTask(scene)}><RotateCcw size={15} />Resume task</button> : <><button className="vs-button" disabled={!!busy || !scene.prompt.trim()} onClick={() => generateScene(scene, 'image')}><Sparkles size={15} />Generate image</button><button className="vs-button" disabled={!!busy || !scene.media || scene.kind === 'video'} onClick={() => generateScene(scene, 'video')}><Film size={15} />Animate</button></>}</div></div><p className="vs-help">Flux creates an image. Kling creates a 5-second clip. Still images get a slow zoom during export.</p>{scene.taskId && <p className="vs-task-id">Saved {scene.taskKind} task: {scene.taskId}</p>}</div></div>}

          {tab === 'voice' && <div className="vs-panel vs-voice-panel" role="tabpanel" id="panel-voice" aria-labelledby="tab-voice"><div className="vs-section-top"><div><h2>Give your story a voice.</h2><p>Generate narration or bring your own recording.</p></div><Mic size={24} /></div><label className="vs-check"><input type="checkbox" checked={customNarration} disabled={!!busy} onChange={e => { setNarration(spokenText); setCustomNarration(e.target.checked) }} />Write a separate narration script</label><label className="vs-field">Narration<textarea value={spokenText} maxLength={5000} rows={5} disabled={!!busy || !customNarration} onChange={e => setNarration(e.target.value)} /></label><p className="vs-help">{customNarration ? 'Custom narration is independent of scene captions.' : 'Uses your scene captions in order. Edit captions in the storyboard to change it.'} Aim for around {Math.floor(duration * 2)} words for {duration} seconds. Narration is a single continuous track.</p><label className="vs-field">ElevenLabs voice ID<input value={keys.voiceId} disabled={!!busy} maxLength={80} onChange={e => setKeys(k => ({ ...k, voiceId: e.target.value }))} /></label><div className="vs-action-row"><button className="vs-button vs-primary" disabled={!!busy || !spokenText.trim()} onClick={() => { if (!requireKey('elevenlabs')) return; void run('Generating narration', async signal => { const blob = await api<Blob>({ action: 'voice', key: keys.elevenlabs, voiceId: keys.voiceId, narration: spokenText }, signal); await attachAudio(blob, 'ElevenLabs narration.mp3'); setMessage('Narration is ready. Play it below and check its length before exporting.') }) }}><Volume2 size={16} />Generate voiceover</button><label className={`vs-button vs-upload ${busy ? 'vs-disabled' : ''}`}><Upload size={16} />Upload audio<input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 30 * 1024 * 1024) { setError('Choose audio smaller than 30 MB.'); return }; void run('Loading narration', async () => { await attachAudio(file, file.name); setMessage('Narration attached.') }) }} /></label></div>{audio ? <div className="vs-audio"><div><span><Mic size={16} />{audio.name}</span><small>{Math.ceil(audio.duration)}s narration / {duration}s video</small></div><audio controls src={audio.url} /><div className="vs-action-row"><button className="vs-text-button" disabled={!!busy} onClick={() => download(audio.blob, audio.name)}>Download audio</button><button className="vs-text-button" disabled={!!busy} onClick={() => setAudio(null)}>Remove narration</button></div>{audio.duration > duration + 0.3 && <p className="vs-inline-error">Narration is longer than the video. Increase scene durations before export.</p>}</div> : <p className="vs-empty-note">No narration attached. You can also export a silent video with captions.</p>}</div>}

          {tab === 'export' && <div className="vs-panel vs-export-panel" role="tabpanel" id="panel-export" aria-labelledby="tab-export"><div className="vs-section-top"><div><h2>Make it a finished video.</h2><p>Composed in your browser, ready to download.</p></div><ArrowDownToLine size={24} /></div><label className="vs-field">Video title<input value={project.title} maxLength={120} disabled={!!busy} onChange={e => setProject(p => ({ ...p, title: e.target.value }))} /></label><dl className="vs-export-details"><div><dt>Frame</dt><dd>{width} × {height}</dd></div><div><dt>Duration</dt><dd>{time(duration)}</dd></div><div><dt>Scenes</dt><dd>{ready} / {project.scenes.length} ready</dd></div><div><dt>Voiceover</dt><dd>{audio ? `${Math.ceil(audio.duration)} seconds` : 'Silent'}</dd></div></dl><label className="vs-check"><input type="checkbox" checked={project.captions} disabled={!!busy} onChange={e => setProject(p => ({ ...p, captions: e.target.checked }))} />Burn captions into video</label><p className="vs-help">Export takes about {duration} seconds. Keep this tab visible. Chrome and Edge export WebM, which you can upload to most video tools. MP4 is used where the browser supports it.</p><button className="vs-button vs-primary vs-render-button" disabled={!!busy || ready !== project.scenes.length || (!!audio && audio.duration > duration + 0.3)} onClick={exportVideo}><Clapperboard size={17} />Render video<ArrowRight size={16} /></button>{output && <div className="vs-output"><video controls src={output.url} aria-label="Rendered final video" /><button className="vs-button vs-primary" onClick={() => download(output.blob, `${slug}.${output.blob.type.includes('mp4') ? 'mp4' : 'webm'}`)}><ArrowDownToLine size={16} />Download video</button></div>}<div className="vs-export-extras"><button className="vs-button" onClick={exportCaptions} disabled={!!busy}><ArrowDownToLine size={15} />Caption file (.srt)</button><button className="vs-button" onClick={() => download(new Blob([spokenText], { type: 'text/plain' }), `${slug}-script.txt`)} disabled={!!busy}><ArrowDownToLine size={15} />Narration script</button></div></div>}
        </section>

        <aside className="vs-preview-area" id="vs-preview" tabIndex={-1} aria-label="Video preview"><a className="vs-mobile-preview-link" href="#vs-scene-editor"><ArrowLeft size={14} />Back to scene {selected + 1}</a><div className="vs-preview-heading"><h2>Preview</h2><label className="vs-ratio"><span className="vs-sr">Aspect ratio</span><select aria-label="Aspect ratio" value={project.ratio} disabled={!!busy} onChange={e => setProject(p => ({ ...p, ratio: e.target.value as Project['ratio'] }))}><option value="9:16">9:16 · Portrait</option><option value="16:9">16:9 · Landscape</option><option value="1:1">1:1 · Square</option></select></label></div><div className="vs-preview-mat"><div className={`vs-frame ${playing && scene.kind === 'image' ? 'vs-frame-playing' : ''}`} style={{ aspectRatio: project.ratio.replace(':', '/') }}>{scene.media ? scene.kind === 'video' ? <video ref={videoRef} src={scene.media} muted playsInline loop preload="auto" aria-label={`Scene ${selected + 1} video`} onError={() => setError('Preview media could not load. Generate or upload it again.')} /> : <img src={scene.media} alt={`Scene ${selected + 1} visual`} onError={() => setError('Preview image could not load. Generate or upload it again.')} /> : <div className="vs-frame-empty"><ImagePlus size={36} /><strong>Your scene goes here</strong><span>Generate an image or upload your own.</span></div>}{project.captions && scene.caption && <div className="vs-caption">{scene.caption}</div>}<span className="vs-preview-scene">Scene {selected + 1} / {project.scenes.length}</span></div></div><div className="vs-playback"><button className="vs-icon-button vs-play-button" disabled={!ready || !!busy} onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause preview' : 'Play preview'}>{playing ? <Pause size={19} /> : <Play size={19} />}</button><input type="range" aria-label="Preview position" min={0} max={duration} step={0.05} value={playhead} disabled={!!busy} onChange={e => { setPlaying(false); const value = Number(e.target.value); setPlayhead(value); let sum = 0; setSelected(Math.max(0, project.scenes.findIndex(s => { sum += s.duration; return value < sum }))) }} /><span>{time(playhead)} <span>/ {time(duration)}</span></span></div><div className="vs-mini-timeline" aria-label="Scene timeline">{project.scenes.map((s, i) => <button key={s.id} className={i === selected ? 'vs-timeline-active' : ''} style={{ flexGrow: s.duration }} aria-label={`Select scene ${i + 1}`} onClick={() => selectScene(i)}><span>{i + 1}</span>{s.kind === 'video' ? <Film size={12} /> : <ImagePlus size={12} />}</button>)}</div><div className="vs-preview-note"><span><span className="vs-dot" />{width} × {height} <span>·</span> {duration}s</span><button className="vs-text-button" disabled={!!busy} onClick={() => setTab('export')}>Export settings <ArrowRight size={13} /></button></div><p className="vs-media-note">{project.scenes.some(s => s.media.startsWith('/assets-v2/')) ? 'Example project · uses existing Power Genie solar imagery. Replace scenes to make it your own.' : 'Preview crops media to fit. The final render includes a slow zoom on still images.'}</p></aside>
      </div>

      <footer className="vs-footer"><span><Clapperboard size={15} />Made for the story you want to tell.</span><div><label className={`vs-text-button vs-upload ${busy ? 'vs-disabled' : ''}`}><Upload size={13} />Open project<input type="file" accept="application/json,.json" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 150000) { setError('Choose a project JSON smaller than 150 KB.'); return }; void run('Opening project', async () => { const loaded = parseProject(JSON.parse(await file.text())); setProject(loaded); setSelected(0); setAudio(null); setCustomNarration(false); setMessage('Project opened. Reattach local media and narration if needed.') }) }} /></label><button className="vs-text-button" disabled={!!busy} onClick={() => { setProject(structuredClone(exampleProject)); setAudio(null); setCustomNarration(false); setSelected(0); setMessage('Example project loaded. It is ready for local preview and video export.') }}><RotateCcw size={13} />Load example</button></div></footer>
    </main>
    {audio && <audio ref={audioRef} src={audio.url} preload="auto" />}
  </div>
}
