import { ADMIN_CONTENT_ID } from './adminScroll'

/** Distance below the panel top at which a heading counts as "reached". */
const ACTIVE_SECTION_OFFSET = 96
/** How long a click-triggered smooth scroll may run before tracking resumes. */
const CLICK_SCROLL_HOLD_MS = 800

export interface ActiveSectionTracker {
  stop: () => void
  /** Pause tracking while a click-triggered scroll animates, then resume. */
  hold: (ms?: number) => void
}

/**
 * Reports which section heading the reader has reached, so the sidebar can
 * follow manual scrolling. Reads layout at most once per animation frame, only
 * in response to a scroll of the admin panel or a change to its DOM (headings
 * appear after data loads), and only calls `onChange` when the answer changes.
 * Never touches the URL.
 */
export function trackActiveSection(
  ids: readonly string[],
  onChange: (id: string) => void,
): ActiveSectionTracker {
  const main = document.getElementById(ADMIN_CONTENT_ID)
  const first = ids[0]
  if (!main || first === undefined) return { stop: () => {}, hold: () => {} }

  let frame = 0
  let holdUntil = 0
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let current: string | undefined

  const compute = () => {
    frame = 0
    if (Date.now() < holdUntil) return
    const present = ids.filter((id) => document.getElementById(id))
    if (!present.length) return
    const line = main.getBoundingClientRect().top + ACTIVE_SECTION_OFFSET
    const atBottom =
      main.scrollTop > 0 &&
      main.scrollTop + main.clientHeight >= main.scrollHeight - 2
    let active = present[0] as string
    if (atBottom) {
      active = present[present.length - 1] as string
    } else {
      for (const id of present) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top !== undefined && top <= line) active = id
      }
    }
    if (active !== current) {
      current = active
      onChange(active)
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(compute)
  }

  main.addEventListener('scroll', schedule, { passive: true })
  const mutations =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(schedule)
  mutations?.observe(main, { childList: true, subtree: true })

  return {
    stop: () => {
      main.removeEventListener('scroll', schedule)
      mutations?.disconnect()
      if (frame) cancelAnimationFrame(frame)
      clearTimeout(holdTimer)
    },
    hold: (ms = CLICK_SCROLL_HOLD_MS) => {
      holdUntil = Date.now() + ms
      clearTimeout(holdTimer)
      holdTimer = setTimeout(schedule, ms + 20)
    },
  }
}
