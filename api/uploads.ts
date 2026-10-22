import { handleApi } from '../server/routes'

export const maxDuration = 30

export function POST(request: Request): Promise<Response> {
  return handleApi(request)
}
