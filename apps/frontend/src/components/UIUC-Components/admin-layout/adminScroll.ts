// Scrolling for the admin panel. Content scrolls inside <main id="main-content">
// (see AdminLayout), not the window.
export const ADMIN_CONTENT_ID = 'main-content'

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'

export function scrollToSection(id: string, smooth = true) {
  document.getElementById(id)?.scrollIntoView({
    behavior: smooth ? scrollBehavior() : 'auto',
    block: 'start',
  })
}

export function scrollContentToTop() {
  document
    .getElementById(ADMIN_CONTENT_ID)
    ?.scrollTo({ top: 0, behavior: scrollBehavior() })
}

/**
 * Updates the URL hash without a Next.js navigation (which would re-run the
 * page and fight our own scroll). Keeps history.state so Next's back/forward
 * handling is unaffected.
 */
export function replaceHash(hash: string) {
  const { pathname, search } = window.location
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${search}${hash ? `#${hash}` : ''}`,
  )
}

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown']

/**
 * Scrolls to a section and keeps it in view while the content above it is
 * still growing (data loading in, skeletons replaced by cards). Stops on the
 * first user interaction or after `timeoutMs`. Returns a cleanup function.
 */
export function followSectionUntilSettled(id: string, timeoutMs = 5000) {
  const main = document.getElementById(ADMIN_CONTENT_ID)
  scrollToSection(id, false)
  if (!main || typeof ResizeObserver === 'undefined') return () => {}

  const observer = new ResizeObserver(() => scrollToSection(id, false))
  Array.from(main.children).forEach((child) => observer.observe(child))

  const stop = () => {
    observer.disconnect()
    clearTimeout(timer)
    USER_SCROLL_EVENTS.forEach((e) => main.removeEventListener(e, stop))
  }
  const timer = setTimeout(stop, timeoutMs)
  USER_SCROLL_EVENTS.forEach((e) =>
    main.addEventListener(e, stop, { passive: true }),
  )
  return stop
}
