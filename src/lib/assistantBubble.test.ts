import { describe, expect, it } from 'vitest'
import { chooseBubbleSpot, iframeObstacles, type Box } from './assistantBubble'

const phone = { width: 390, height: 844 }
const desktop = { width: 1200, height: 800 }

describe('chat bubble placement', () => {
  it('sits in the bottom-right corner when nothing important is there', () => {
    expect(chooseBubbleSpot(desktop, [])).toEqual({ left: 1128, top: 728 })
    expect(chooseBubbleSpot(phone, [])).toEqual({ left: 318, top: 772 })
  })

  it('rises above a full-width phone quote button and stays on the right', () => {
    const quoteButton: Box = { left: 16, top: 780, right: 374, bottom: 832 }
    const spot = chooseBubbleSpot(phone, [quoteButton])
    expect(spot.left).toBe(318)
    expect(spot.top + 56).toBeLessThanOrEqual(quoteButton.top - 8)
    expect(spot.top).toBe(716)
  })

  it('moves to the bottom-left when the quote form fills the right side', () => {
    const frame: Box = { left: 640, top: 120, right: 1180, bottom: 780 }
    const parts = iframeObstacles(frame)
    const spot = chooseBubbleSpot(desktop, [parts.hard], [parts.soft])
    expect(spot).toEqual({ left: 16, top: 728 })
    expect(spot.left + 56).toBeLessThanOrEqual(frame.left)
  })

  it('stays out of the Sunrun submit band when the form covers the screen', () => {
    const frame: Box = { left: 0, top: 0, right: 390, bottom: 844 }
    const parts = iframeObstacles(frame)
    const spot = chooseBubbleSpot(phone, [parts.hard], [parts.soft])
    expect(spot.left).toBe(318)
    expect(spot.top).toBe(80)
    expect(spot.top + 56).toBeLessThanOrEqual(parts.hard.top - 8)
  })

  it('keeps a short form entirely in the submit band', () => {
    const parts = iframeObstacles({ left: 10, top: 40, right: 100, bottom: 90 }, 180)
    expect(parts.hard.top).toBe(40)
    expect(parts.soft.bottom - parts.soft.top).toBe(0)
  })
})
