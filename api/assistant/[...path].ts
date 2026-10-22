import { handleApi } from '../../server/routes'

export const maxDuration = 60

export function GET(request: Request): Promise<Response> {
  return handleApi(request)
}

export function POST(request: Request): Promise<Response> {
  return handleApi(request)
}
