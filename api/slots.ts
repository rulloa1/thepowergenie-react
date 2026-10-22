import { handleApi } from '../server/routes'

export const maxDuration = 15

export function GET(request: Request): Promise<Response> {
  return handleApi(request)
}