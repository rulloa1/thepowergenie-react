/**
 * Lock viewport scrolling while a menu or modal is open.
 *
 * The lock is a class on the root element, not `overflow` on `body`.
 * Setting overflow on body turns it into a second scroll container. That
 * detaches `position: fixed` during a fling (the landing page is built from
 * fixed scenes) and, when the inline style is restored to a stale value,
 * can leave the page unable to scroll after the overlay closes.
 *
 * Callers may overlap (menu plus assistant). The page unlocks when the last
 * caller releases, and the scroll offset from the first lock is put back if
 * the browser dropped it.
 */
let locks = 0
let savedY = 0

export function lockPageScroll(): () => void {
  const root = document.documentElement
  if (locks === 0) {
    savedY = window.scrollY
    root.classList.add('pg-scroll-lock')
    if (Math.abs(window.scrollY - savedY) > 1) window.scrollTo(0, savedY)
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks > 0) return
    root.classList.remove('pg-scroll-lock')
    if (Math.abs(window.scrollY - savedY) > 1) window.scrollTo(0, savedY)
  }
}
