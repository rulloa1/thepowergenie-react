export type RateBucket = Map<string, number[]>;

export function clientRateKey(forwarded: string | string[] | undefined): string {
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const hop = raw?.split(',')[0]?.trim() ?? '';
  if (/^[0-9a-fA-F:.]{3,64}$/.test(hop)) return hop;
  return 'unknown';
}

export function allowRate(
  bucket: RateBucket,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): boolean {
  const recent = (bucket.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    bucket.set(key, recent);
    return false;
  }
  recent.push(now);
  bucket.set(key, recent);
  return true;
}
