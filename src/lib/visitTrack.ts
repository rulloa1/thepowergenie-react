let lastTrackedPage = ''
let lastTrackedTime = 0

/**
 * Pings /api/visit whenever a user navigates to an information entry page.
 * Client-throttled to at most 1 alert every 5 minutes per page per session.
 */
export function trackInfoPageVisit(page: string) {
  const now = Date.now()
  if (lastTrackedPage === page && now - lastTrackedTime < 5 * 60 * 1000) return
  lastTrackedPage = page
  lastTrackedTime = now

  try {
    fetch('/api/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page }),
      keepalive: true,
    }).catch(() => {
      // Non-blocking ping
    })
  } catch {
    // Non-blocking ping
  }
}
