/**
 * Where the closed chat bubble sits.
 *
 * Homeowners expect it in the bottom-right corner. That corner is also where
 * the phone quote button, the Sunrun form's submit area, and the booking
 * page's confirm button live, so the bubble steps aside when one of those
 * controls is in the way.
 */

export type Box = { left: number; top: number; right: number; bottom: number }

export type BubbleSpot = { left: number; top: number }

export const BUBBLE_SIZE = 56
export const BUBBLE_MARGIN = 16
/** Bottom slice of the quote iframe reserved for the Sunrun submit control. */
export const SUBMIT_BAND_PX = 180

export function boxesOverlap(a: Box, b: Box, pad = 0): boolean {
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad
}

/** Split a quote-form rectangle into the submit band and the rest of the form. */
export function iframeObstacles(rect: Box, bandPx = SUBMIT_BAND_PX): { hard: Box; soft: Box } {
  const bandTop = Math.max(rect.top, rect.bottom - bandPx)
  return {
    hard: { left: rect.left, top: bandTop, right: rect.right, bottom: rect.bottom },
    soft: { left: rect.left, top: rect.top, right: rect.right, bottom: bandTop },
  }
}

type SpotOptions = {
  size?: number
  margin?: number
  safeTop?: number
  safeRight?: number
  safeBottom?: number
  safeLeft?: number
}

function area(box: Box): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top)
}

/**
 * Prefer the bottom-right corner. Nudge up a short way to clear a bar, then
 * try the bottom-left, then anywhere that misses the hard controls. Soft
 * obstacles (the rest of the quote form) are avoided when another spot exists.
 */
export function chooseBubbleSpot(
  viewport: { width: number; height: number },
  hard: readonly Box[],
  soft: readonly Box[] = [],
  options: SpotOptions = {},
): BubbleSpot {
  const size = options.size ?? BUBBLE_SIZE
  const margin = options.margin ?? BUBBLE_MARGIN
  const safeTop = Math.max(0, options.safeTop ?? 0)
  const safeRight = Math.max(margin, (options.safeRight ?? 0) + margin)
  const safeBottom = Math.max(margin, (options.safeBottom ?? 0) + margin)
  const safeLeft = Math.max(margin, (options.safeLeft ?? 0) + margin)
  const minTop = safeTop + margin + 64
  const preferredLeft = viewport.width - safeRight - size
  const preferredTop = viewport.height - safeBottom - size
  const blockers = (boxes: readonly Box[]) => boxes.filter(box => area(box) > 1)
  const hardBoxes = blockers(hard)
  const softBoxes = blockers(soft)
  const both = hardBoxes.concat(softBoxes)

  const spotBox = (spot: BubbleSpot): Box => ({
    left: spot.left,
    top: spot.top,
    right: spot.left + size,
    bottom: spot.top + size,
  })

  const fits = (spot: BubbleSpot) => {
    const box = spotBox(spot)
    return box.left >= safeLeft - 0.5
      && box.top >= minTop - 0.5
      && box.right <= viewport.width - (options.safeRight ?? 0) + 0.5
      && box.bottom <= viewport.height - (options.safeBottom ?? 0) + 0.5
  }

  const clearOf = (spot: BubbleSpot, boxes: readonly Box[]) =>
    boxes.every(box => !boxesOverlap(spotBox(spot), box, 8))

  const search = (columns: number[], maxRise: number, boxes: readonly Box[]): BubbleSpot | null => {
    const floor = Math.max(minTop, preferredTop - maxRise)
    for (const left of columns) {
      for (let top = preferredTop; top >= floor; top -= 8) {
        const spot = { left, top }
        if (fits(spot) && clearOf(spot, boxes)) return spot
      }
    }
    return null
  }

  // Used only when every corner overlaps the form. Sit as high as possible so
  // the bubble stays away from the submit band at the bottom of that form.
  const searchFromTop = (columns: number[], boxes: readonly Box[]): BubbleSpot | null => {
    for (const left of columns) {
      for (let top = minTop; top <= preferredTop; top += 8) {
        const spot = { left, top }
        if (fits(spot) && clearOf(spot, boxes)) return spot
      }
    }
    return null
  }

  const right = [preferredLeft]
  const left = [safeLeft]
  const shortRise = 160

  return search(right, shortRise, both)
    || search(left, shortRise, both)
    || search(right.concat(left), Number.POSITIVE_INFINITY, both)
    || searchFromTop(right.concat(left), hardBoxes)
    || { left: safeLeft, top: minTop }
}
