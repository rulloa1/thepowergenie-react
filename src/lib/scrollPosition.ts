/**
 * Scroll offset to restore when the scrub track is rebuilt (resize, scrollbar).
 *
 * Inside the story, keep the same fraction of the journey so a real viewport
 * change does not skip scenes. Past the journey — the quote panel — keep the
 * same pixel offset below the track. Clamping that position back to the end
 * of the track jumps the form up under the visitor.
 */
export function preservedScrollTop(scrollY: number, prevJourney: number, nextJourney: number): number {
  if (!(prevJourney > 0)) return scrollY
  const past = scrollY - prevJourney
  if (past > 1) return nextJourney + past
  const progress = Math.min(1, Math.max(0, scrollY / prevJourney))
  return progress * nextJourney
}
