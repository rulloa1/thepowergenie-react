export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 80)
  }
  return (request.headers.get('x-real-ip') || 'unknown').slice(0, 80)
}

/** Browsers send Origin. Reject cross-site posts. Missing Origin is allowed for non-browser clients. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  if (!origin) return
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    throw new HttpError(403, 'Request blocked.')
  }
  let urlHost = ''
  try {
    urlHost = new URL(request.url).host
  } catch {
    urlHost = ''
  }
  const host = request.headers.get('host')
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const strip = (h: string | null | undefined) => (h || '').trim().toLowerCase().replace(/^www\./i, '')
  const normOrigin = strip(originHost)
  if (
    originHost === urlHost ||
    originHost === host ||
    originHost === forwarded ||
    normOrigin === strip(urlHost) ||
    normOrigin === strip(host) ||
    normOrigin === strip(forwarded) ||
    normOrigin === 'thepowergenie.theroyeffect.com'
  ) return
  throw new HttpError(403, 'Request blocked.')
}

export function honeypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** Body reader for the assistant's Web Request routes. */
export async function readWebJson(request: Request, maxChars: number): Promise<unknown> {
  const text = await request.text()
  if (text.length > maxChars) {
    throw new HttpError(413, 'Request is too large.')
  }
  if (!text.trim()) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError(400, 'Invalid request.')
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
