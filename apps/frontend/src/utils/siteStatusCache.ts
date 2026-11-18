// Shared cache and explicit-refresh protocol for the public site-status endpoint.

/**
 * Maximum shared-cache lifetime for an ordinary status response.
 */
export const SITE_STATUS_SHARED_MAX_AGE_SECONDS = 5

/**
 * Ordinary polls: a short shared cache, and the browser always revalidates so
 * a toggle reaches open tabs within one poll plus the shared-cache age.
 */
export const SITE_STATUS_CACHE_CONTROL = `public, max-age=0, s-maxage=${SITE_STATUS_SHARED_MAX_AGE_SECONDS}, must-revalidate`

/**
 * Query parameter that marks an explicit refresh, sent right after a settings
 * save. A per-call nonce avoids reusing an ordinary cached response.
 */
export const SITE_STATUS_FRESH_PARAM = 'fresh'

/** Explicit refreshes and every failure are never stored by any cache. */
export const SITE_STATUS_NO_STORE = 'no-store'
