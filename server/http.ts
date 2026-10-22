import type { VercelRequest, VercelResponse } from '@vercel/node'

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
  if (originHost === urlHost || originHost === host || originHost === forwarded) return
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

export function sendJson(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

export function notConfigured(res: VercelResponse) {
  sendJson(res, 503, {
    error: 'not_configured',
    message: 'This feature is not configured yet.',
  })
}

export function assertMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  sendJson(res, 405, { error: 'method_not_allowed', message: 'That action is not available.' })
  return false
}

export function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization
  if (!header) return null
  const value = Array.isArray(header) ? header[0] : header
  const match = /^Bearer\s+(\S+)/i.exec(value)
  return match?.[1] ?? null
}

export function queryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Body reader for the dashboard and /book Vercel routes. */
export function readJson(req: VercelRequest): unknown {
  if (req.body == null || req.body === '') return {}
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as unknown
    } catch {
      return null
    }
  }
  if (typeof req.body === 'object') return req.body as unknown
  return null
}

export function withErrors(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      console.error('api error', error instanceof Error ? error.name : 'unknown')
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: 'server_error',
          message: 'Something went wrong. Please try again.',
        })
      }
    }
  }
}
