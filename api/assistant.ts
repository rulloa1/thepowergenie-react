import { handleApi } from '../server/routes.js'

export const maxDuration = 60

export function GET(request: Request): Promise<Response> {
  return handleApi(request)
}

export function POST(request: Request): Promise<Response> {
  return handleApi(request)
}
