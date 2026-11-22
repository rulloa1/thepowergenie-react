export type Scene = {
  id: string
  caption: string
  prompt: string
  duration: number
  media: string
  kind: 'image' | 'video'
  taskId?: string
  taskKind?: 'image' | 'video'
}

export type Project = {
  title: string
  idea: string
  style: string
  ratio: '9:16' | '16:9' | '1:1'
  captions: boolean
  scenes: Scene[]
}

export const exampleProject: Project = {
  title: 'A little more sunlight',
  idea: 'A cinematic short about the journey of sunlight, from the sun to a solar-powered home.',
  style: 'Cinematic', ratio: '9:16', captions: true,
  scenes: [
    { id: 'sun', caption: 'It starts with a little sunlight.', prompt: 'The sun rising over the horizon, warm golden light, cinematic wide shot, slow camera push, no text.', duration: 5, media: '/assets-v2/stills/01-sun-m.webp', kind: 'image' },
    { id: 'roof', caption: 'A new way to power the everyday.', prompt: 'Black solar panels on a modern home in golden afternoon light, cinematic architectural photography, no text.', duration: 5, media: '/assets-v2/stills/02-roof-m.webp', kind: 'image' },
    { id: 'home', caption: 'Bring that energy home.', prompt: 'A warmly lit modern home at dusk, quiet neighborhood, cinematic photography, slow camera drift, no text.', duration: 5, media: '/assets-v2/stills/04-home-m.webp', kind: 'image' },
  ],
}

export const dimensions = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [960, 960] } as const
export const totalDuration = (scenes: Scene[]) => scenes.reduce((sum, scene) => sum + scene.duration, 0)

export function localStoryboard(idea: string): Scene[] {
  const sentences = idea.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean)
  return Array.from({ length: Math.max(3, Math.min(6, sentences.length)) }, (_, i) => ({
    id: crypto.randomUUID(),
    caption: sentences[i] || (i === 1 ? 'Show the detail that makes this story matter.' : 'End with the moment you want people to remember.'),
    prompt: `${idea.trim()}. ${['Establishing shot', 'Close-up of the subject', 'Concluding wide shot'][i % 3]}, no text.`,
    duration: 5, media: '', kind: 'image' as const,
  }))
}

export function parseProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('Choose a Video Studio project JSON file.')
  const p = value as Record<string, unknown>
  if (typeof p.title !== 'string' || typeof p.idea !== 'string' || !Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > 12) throw new Error('The project must have a title, idea, and 1–12 scenes.')
  const scenes = p.scenes.map((v: unknown) => {
    if (!v || typeof v !== 'object') throw new Error('Invalid scene in project.')
    const s = v as Record<string, unknown>
    if (typeof s.caption !== 'string' || s.caption.length > 600 || typeof s.prompt !== 'string' || s.prompt.length > 2500 || typeof s.duration !== 'number' || !Number.isFinite(s.duration) || s.duration < 3 || s.duration > 10) throw new Error('Scenes need captions, prompts, and durations of 3–10 seconds.')
    const media = typeof s.media === 'string' && (/^https:\/\//.test(s.media) || /^\/(?!\/)/.test(s.media)) ? s.media : ''
    return { id: crypto.randomUUID(), caption: s.caption, prompt: s.prompt, duration: s.duration, media, kind: s.kind === 'video' ? 'video' as const : 'image' as const,
      ...(typeof s.taskId === 'string' && /^[\w-]{1,100}$/.test(s.taskId) ? { taskId: s.taskId, taskKind: s.taskKind === 'video' ? 'video' as const : 'image' as const } : {}) }
  })
  return { title: p.title.slice(0, 120), idea: p.idea.slice(0, 2000), style: typeof p.style === 'string' ? p.style.slice(0, 40) : 'Cinematic', ratio: p.ratio === '16:9' || p.ratio === '1:1' ? p.ratio : '9:16', captions: p.captions !== false, scenes }
}

export function projectForSave(project: Project): Project {
  return { ...project, scenes: project.scenes.map(s => ({ ...s, media: s.media.startsWith('blob:') ? '' : s.media })) }
}
