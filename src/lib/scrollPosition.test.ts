import { describe, expect, it } from 'vitest'
import { preservedScrollTop } from './scrollPosition'

describe('preservedScrollTop', () => {
  it('keeps the same fraction of the journey', () => {
    expect(preservedScrollTop(2400, 8000, 6000)).toBe(1800)
  })

  it('keeps a quote-panel offset instead of clamping to the end of the track', () => {
    expect(preservedScrollTop(8600, 7880, 7880)).toBe(8600)
    expect(preservedScrollTop(8600, 8000, 6400)).toBe(7000)
  })

  it('leaves the offset alone before the track exists', () => {
    expect(preservedScrollTop(400, 0, 8000)).toBe(400)
  })
})
