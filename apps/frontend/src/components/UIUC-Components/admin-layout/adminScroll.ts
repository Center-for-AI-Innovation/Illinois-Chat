// Scrolling for the admin panel. Content scrolls inside
// <main id="admin-panel-content"> (see AdminLayout), not the window. The id is
// deliberately not "main-content": many page shells already use that id as the
// app's skip-link target, and a duplicate would make getElementById ambiguous.
export const ADMIN_CONTENT_ID = 'admin-panel-content'

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ? 'auto'
    : 'smooth'

export function scrollToSection(id: string, smooth = true) {
  document.getElementById(id)?.scrollIntoView({
    behavior: smooth ? scrollBehavior() : 'auto',
    block: 'start',
  })
}

/** Moves focus into the scrolling panel (skip-link target). */
export function focusAdminContent() {
  document.getElementById(ADMIN_CONTENT_ID)?.focus()
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

  // Created before anything that can call `stop`, so `stop` never reads
  // `timer` before it is initialised. The arrow defers the `stop` lookup.
  const timer = setTimeout(() => stop(), timeoutMs)
  const observed = new Set<Element>()
  const observer = new ResizeObserver(() => scrollToSection(id, false))
  const observeChildren = () =>
    Array.from(main.children).forEach((child) => {
      if (!observed.has(child)) {
        observed.add(child)
        observer.observe(child)
      }
    })
  observeChildren()
  // A page that swaps a top-level child (skeleton -> content) adds a new
  // element the ResizeObserver has never seen; pick it up and re-scroll.
  const mutations =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => {
          observeChildren()
          scrollToSection(id, false)
        })
  mutations?.observe(main, { childList: true })

  const stop = () => {
    observer.disconnect()
    mutations?.disconnect()
    clearTimeout(timer)
    USER_SCROLL_EVENTS.forEach((e) => main.removeEventListener(e, stop))
  }
  USER_SCROLL_EVENTS.forEach((e) =>
    main.addEventListener(e, stop, { passive: true }),
  )
  return stop
}
