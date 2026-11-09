/** Gone public customer-document paths. The Referral Hub reads the private bucket instead. */

function notFound(method: string): Response {
  return new Response(method === 'HEAD' ? null : 'Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  })
}

export function GET(): Response {
  return notFound('GET')
}

export function HEAD(): Response {
  return notFound('HEAD')
}
