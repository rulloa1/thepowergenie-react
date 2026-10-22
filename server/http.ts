import type { VercelRequest, VercelResponse } from '@vercel/node';

export function sendJson(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function notConfigured(res: VercelResponse) {
  sendJson(res, 503, {
    error: 'not_configured',
    message: 'This feature is not configured yet.',
  });
}

export function assertMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  sendJson(res, 405, { error: 'method_not_allowed', message: 'That action is not available.' });
  return false;
}

export function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)/i.exec(value);
  return match?.[1] ?? null;
}

export function queryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function readJson(req: VercelRequest): unknown {
  if (req.body == null || req.body === '') return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof req.body === 'object') return req.body as unknown;
  return null;
}

export function withErrors(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('api error', error instanceof Error ? error.name : 'unknown');
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: 'server_error',
          message: 'Something went wrong. Please try again.',
        });
      }
    }
  };
}
