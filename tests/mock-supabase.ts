import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export type MockCall = {
  method: string
  path: string
  headers: IncomingMessage['headers']
  json: unknown
}

type Row = Record<string, unknown>

export type MockSupabase = {
  url: string
  calls: MockCall[]
  customers: Row[]
  files: Row[]
  activity: Row[]
  close: () => Promise<void>
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function fileBytes(body: Buffer, contentType: string): Buffer {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  if (!match) return body
  const boundary = `--${(match[1] || match[2]).trim()}`
  const marker = Buffer.from(boundary)
  let cursor = body.indexOf(marker)
  while (cursor !== -1) {
    const next = body.indexOf(marker, cursor + marker.length)
    if (next === -1) break
    const part = body.subarray(cursor + marker.length, next)
    const split = part.indexOf('\r\n\r\n')
    if (split !== -1) {
      const headers = part.subarray(0, split).toString('utf8')
      if (!/name="cacheControl"/i.test(headers)) {
        let data = part.subarray(split + 4)
        if (data.subarray(-2).toString() === '\r\n') data = data.subarray(0, -2)
        if (data.length) return data
      }
    }
    cursor = next
  }
  return body
}

function send(res: ServerResponse, status: number, body: unknown, contentType = 'application/json'): void {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  res.statusCode = status
  res.setHeader('content-type', contentType)
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', '*')
  res.end(payload)
}

export async function startMockSupabase(): Promise<MockSupabase> {
  const objects = new Map<string, Buffer>()
  const customers: Row[] = []
  const files: Row[] = []
  const activity: Row[] = []
  const calls: MockCall[] = []

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      send(res, 204, '')
      return
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const body = await readBody(req)
    let json: unknown = null
    const contentType = String(req.headers['content-type'] || '')
    if (contentType.includes('application/json') && body.length) {
      try {
        json = JSON.parse(body.toString('utf8'))
      } catch {
        json = null
      }
    }
    calls.push({ method: req.method || 'GET', path: `${url.pathname}${url.search}`, headers: req.headers, json })

    if (url.pathname === '/__calls') {
      send(res, 200, calls.map(call => ({
        method: call.method,
        path: call.path,
        authorization: call.headers.authorization ?? null,
        apikey: call.headers.apikey ?? null,
        userAgent: call.headers['user-agent'] ?? null,
        json: call.json,
      })))
      return
    }

    const signPrefix = '/storage/v1/object/upload/sign/powergenie/'
    if (url.pathname.startsWith(signPrefix) && req.method === 'POST') {
      const objectPath = decodeURIComponent(url.pathname.slice(signPrefix.length))
      const token = `tok-${objectPath.length}`
      send(res, 200, { url: `/object/upload/sign/powergenie/${objectPath}?token=${token}`, token })
      return
    }
    if (url.pathname.startsWith(signPrefix) && req.method === 'PUT') {
      const objectPath = decodeURIComponent(url.pathname.slice(signPrefix.length))
      objects.set(objectPath, fileBytes(body, contentType))
      send(res, 200, { Key: `powergenie/${objectPath}` })
      return
    }

    const objectPrefix = '/storage/v1/object/powergenie/'
    if (url.pathname.startsWith(objectPrefix) && req.method === 'GET') {
      const objectPath = decodeURIComponent(url.pathname.slice(objectPrefix.length))
      const stored = objects.get(objectPath)
      if (!stored) {
        send(res, 404, { error: 'not found' })
        return
      }
      send(res, 200, stored, 'application/octet-stream')
      return
    }
    if (url.pathname === '/storage/v1/object/powergenie' && req.method === 'DELETE') {
      const prefixes = (json as { prefixes?: string[] } | null)?.prefixes || []
      for (const prefix of prefixes) objects.delete(prefix)
      send(res, 200, { message: 'deleted' })
      return
    }
    if (url.pathname === '/storage/v1/object/move' && req.method === 'POST') {
      const payload = json as { sourceKey?: string; destinationKey?: string }
      const stored = payload.sourceKey ? objects.get(payload.sourceKey) : undefined
      if (!stored || !payload.destinationKey) {
        send(res, 404, { error: 'not found' })
        return
      }
      objects.set(payload.destinationKey, stored)
      objects.delete(payload.sourceKey as string)
      send(res, 200, { message: 'moved' })
      return
    }

    const table = url.pathname.startsWith('/rest/v1/') ? url.pathname.slice('/rest/v1/'.length) : ''
    const collection = table === 'powergenie_customers' ? customers : table === 'powergenie_files' ? files : table === 'powergenie_activity' ? activity : null
    if (collection && req.method === 'POST') {
      const row = json as Row
      if (collection.some(item => item.id === row.id)) {
        send(res, 409, { code: '23505', message: 'duplicate' })
        return
      }
      collection.push(row)
      send(res, 201, [row])
      return
    }
    if (table === 'powergenie_customers' && req.method === 'GET') {
      const filters = url.searchParams.getAll('appointment_date')
      const gte = filters.find(item => item.startsWith('gte.'))?.slice(4)
      const lt = filters.find(item => item.startsWith('lt.'))?.slice(3)
      const matched = customers.filter(row => {
        const when = String(row.appointment_date || '')
        if (!when) return false
        if (gte && when < gte) return false
        if (lt && when >= lt) return false
        return true
      })
      send(res, 200, matched.map(row => ({ id: row.id, appointment_date: row.appointment_date })))
      return
    }

    send(res, 404, { error: 'mock route not found', path: url.pathname })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('mock failed to bind')
  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    customers,
    files,
    activity,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}
