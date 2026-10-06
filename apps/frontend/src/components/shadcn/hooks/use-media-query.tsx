import * as React from 'react'

/**
 * Returns `false` on the server and until mount, then tracks the query live
 * via `matchMedia`. Deferring to an effect keeps server and first client
 * render in agreement, so this never causes a hydration mismatch. Unlike `use-mobile.tsx`'s `useIsMobile`, this takes an
 * arbitrary query string rather than a fixed 768px breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
