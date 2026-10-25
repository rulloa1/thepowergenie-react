import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import {
  chooseBubbleSpot,
  iframeObstacles,
  type Box,
} from '../../lib/assistantBubble'
import type { AssistantMode } from '../../lib/openAssistant'
import { marketingViewFromLocation } from '../../lib/siteRoutes'

const AssistantPanel = lazy(() => import('./AssistantPanel'))

const frameClass =
  'pg-assistant-panel fixed z-[80] flex flex-col bg-[#F6F7FB] text-[#1A1A2E] inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-96px))] sm:w-[min(400px,calc(100vw-48px))] sm:overflow-hidden sm:rounded-[28px] sm:border sm:border-[#1A1A2E]/10 sm:shadow-[0_24px_60px_rgba(10,20,40,0.28)]'

const HARD_SELECTORS = [
  '.quote-cta-mobile',
  '.sw-topbar',
  '.sw-mobile-menu > summary',
  '.sw-mobile-menu[open] nav',
  '.rep-card',
  '[data-testid="book-consult"]',
  '.sw-copy__cta',
  '.sw-topcta',
  'label:has(input[type="file"])',
]

export default function PowerGenieAssistant() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AssistantMode>('chat')
  const [nonce, setNonce] = useState(0)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const returnToLauncher = useRef(false)
  const returnTo = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const root = document.documentElement
    if (!root.dataset.pgBrand) {
      const view = marketingViewFromLocation(window.location.pathname, window.location.search)
      root.dataset.pgBrand = view === 'journey' ? 'power-genie' : view
    }
  }, [])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: AssistantMode }>).detail
      const active = document.activeElement
      returnToLauncher.current = false
      returnTo.current = active instanceof HTMLElement ? active : null
      setMode(detail?.mode || 'chat')
      setNonce(value => value + 1)
      setOpen(true)
    }
    window.addEventListener('powergenie:open', onOpen)
    return () => window.removeEventListener('powergenie:open', onOpen)
  }, [])

  useEffect(() => {
    if (open || !returnToLauncher.current) return
    returnToLauncher.current = false
    launcherRef.current?.focus()
  }, [open])

  function closePanel() {
    const opener = returnTo.current
    returnTo.current = null
    if (opener && opener.isConnected) {
      returnToLauncher.current = false
      setOpen(false)
      requestAnimationFrame(() => opener.focus())
      return
    }
    returnToLauncher.current = true
    setOpen(false)
  }

  return (
    <>
      {open ? (
        <Suspense fallback={<div className={frameClass} role="status">Opening the Power Genie…</div>}>
          <AssistantPanel frameClass={frameClass} mode={mode} nonce={nonce} onClose={closePanel} />
        </Suspense>
      ) : (
        <button
          ref={launcherRef}
          type="button"
          id="genie-launcher"
          data-testid="genie-launcher"
          aria-expanded={false}
          aria-haspopup="dialog"
          className="pg-assistant-launcher inline-flex items-center justify-center border-0 p-0"
          onClick={() => {
            returnToLauncher.current = true
            returnTo.current = null
            setMode('chat')
            setNonce(value => value + 1)
            setOpen(true)
          }}
        >
          <MessageCircle className="h-7 w-7" aria-hidden="true" />
          <span className="sr-only">Talk to the Power Genie</span>
        </button>
      )}
      {!open ? <BubblePlacement target={launcherRef} /> : null}
    </>
  )
}

function BubblePlacement({ target }: { target: React.RefObject<HTMLButtonElement> }) {
  useLayoutEffect(() => {
    const node = target.current
    if (!node) return
    let frame = 0
    let placed = false
    let safe = readSafeArea()
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const place = () => {
      const { hard, soft } = collectObstacles()
      const spot = chooseBubbleSpot(
        { width: window.innerWidth, height: window.innerHeight },
        hard,
        soft,
        safe,
      )
      node.style.transition = placed && !motion ? 'top 160ms ease, left 160ms ease' : 'none'
      node.style.left = `${spot.left}px`
      node.style.top = `${spot.top}px`
      node.style.right = 'auto'
      node.style.bottom = 'auto'
      placed = true
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }

    // The solar story is a scroll-scrubbed page. Reading layout on every frame
    // of a fling makes that scrub stutter, so follow scroll only while the
    // quote form or the booking page can slide under the bubble.
    let scrollTimer = 0
    const onScroll = () => {
      if (scrollTimer) return
      scrollTimer = window.setTimeout(() => {
        scrollTimer = 0
        place()
      }, 120)
    }

    const trackScroll = () => {
      const path = window.location.pathname.replace(/\/+$/, '') || '/'
      const follow = document.documentElement.classList.contains('quote-in-view') || path === '/book'
      if (!follow) return
      window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    }

    const onResize = () => {
      safe = readSafeArea()
      schedule()
    }

    place()
    trackScroll()
    window.addEventListener('resize', onResize)
    const observer = new MutationObserver(() => {
      window.removeEventListener('scroll', onScroll, true)
      trackScroll()
      schedule()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(scrollTimer)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, [target])

  return null
}

function readSafeArea() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const read = (value: string) => Number.parseFloat(value) || 0
  const insets = {
    safeTop: read(style.paddingTop),
    safeRight: read(style.paddingRight),
    safeBottom: read(style.paddingBottom),
    safeLeft: read(style.paddingLeft),
  }
  probe.remove()
  return insets
}

function elementBox(element: Element): Box | null {
  const node = element as HTMLElement
  if (coveredByHiddenAncestor(node)) return null
  const rect = node.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return null
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function coveredByHiddenAncestor(node: HTMLElement): boolean {
  for (let current: HTMLElement | null = node; current; current = current.parentElement) {
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    if (Number.parseFloat(style.opacity) === 0) return true
  }
  return false
}

function collectObstacles(): { hard: Box[]; soft: Box[] } {
  const hard: Box[] = []
  const soft: Box[] = []
  for (const selector of HARD_SELECTORS) {
    document.querySelectorAll(selector).forEach(element => {
      const box = elementBox(element)
      if (box) hard.push(box)
    })
  }
  document.querySelectorAll('.quote-panel__frame').forEach(element => {
    const box = elementBox(element)
    if (!box) return
    const parts = iframeObstacles(box)
    hard.push(parts.hard)
    soft.push(parts.soft)
  })
  document.querySelectorAll('#root form button[type="submit"]').forEach(element => {
    const box = elementBox(element)
    if (box) hard.push(box)
  })
  return { hard, soft }
}
