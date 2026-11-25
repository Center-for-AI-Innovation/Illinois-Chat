import { useEffect, useRef } from 'react'

// Scrolling for the admin panel. Content scrolls inside
// <main id="admin-panel-content"> (see AdminLayout), not the window. The id is
// deliberately not "main-content": many page shells already use that id as the
// app's skip-link target, and a duplicate would make getElementById ambiguous.
export const ADMIN_CONTENT_ID = 'admin-panel-content'

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

// Decoded so it compares equal to section ids; a malformed escape falls back to raw.
export function readLocationHash() {
  const raw = window.location.hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function scrollContentToTop() {
  document.getElementById(ADMIN_CONTENT_ID)?.scrollTo({
    top: 0,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

/**
 * Scrolls once to the heading named by the URL hash, when the page says it has
 * finished loading. Only the page knows when its data has arrived, so there is
 * nothing to observe or time out: pass `true` once the content above the
 * heading has its final height (placeholders should match it) and the view
 * moves a single time. Clicks on in-page section links are left to the router.
 */
export function useScrollToHashWhenReady(ready: boolean) {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    const id = readLocationHash()
    if (!id) return
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ block: 'start' }),
    )
  }, [ready])
}
