import { handleApi } from './routes.js'

type NodeRequest = {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array | string>
}

type NodeResponse = {
  statusCode: number
  headersSent: boolean
  setHeader: (name: string, value: string) => void
  write: (chunk: Uint8Array) => void
  end: (chunk?: string) => void
}

/** Vite dev middleware adapter. Production uses the /api exports on Vercel. */
export async function handleNodeRequest(req: NodeRequest, res: NodeResponse): Promise<void> {
  const hostHeader = req.headers.host
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || '127.0.0.1'
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  const method = req.method || 'GET'
  const chunks: Buffer[] = []
  if (method !== 'GET' && method !== 'HEAD') {
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
    }
  }
  const request = new Request(`http://${host}${req.url || '/'}`, {
    method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  })
  const response = await handleApi(request)
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    if (key === 'transfer-encoding' || key === 'content-encoding') return
    res.setHeader(key, value)
  })
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}
