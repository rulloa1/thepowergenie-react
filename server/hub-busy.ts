export type InstantRange = { start: Date; end: Date }

export function rangesOverlap(start: Date, end: Date, ranges: InstantRange[]): boolean {
  const startMs = start.getTime()
  const endMs = end.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false
  return ranges.some(range => startMs < range.end.getTime() && range.start.getTime() < endMs)
}

/** Turns hub appointment_date values into busy windows of the assistant's consult length. */
export function hubConsultRanges(values: unknown[], durationMs: number, from: Date, to: Date): InstantRange[] {
  const ranges: InstantRange[] = []
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue
    const start = new Date(value)
    const startMs = start.getTime()
    if (!Number.isFinite(startMs)) continue
    const end = new Date(startMs + durationMs)
    if (end <= from || start >= to) continue
    ranges.push({ start, end })
  }
  return ranges
}
