/**
 * Best-effort per-instance limiter. Serverless isolates do not share memory,
 * so this slows a noisy client on one instance. It is not a global quota.
 */
import { HttpError } from './http.js'

type Bucket = { reset: number; count: number }

const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 5000) {
    for (const [id, bucket] of buckets) {
      if (bucket.reset <= now) buckets.delete(id)
    }
  }
  const existing = buckets.get(key)
  if (!existing || existing.reset <= now) {
    buckets.set(key, { reset: now + windowMs, count: 1 })
    return true
  }
  if (existing.count >= limit) return false
  existing.count += 1
  return true
}

export function resetRateLimits(): void {
  buckets.clear()
}

export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  if (!rateLimit(key, limit, windowMs)) {
    throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.')
  }
}
