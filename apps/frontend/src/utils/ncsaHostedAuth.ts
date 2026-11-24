/**
 * Guards for server-side secrets that must only ever be sent to hosts the
 * operator configured via env — never to a URL a project admin typed in.
 */

function originOf(url: string | undefined | null): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** True when `url` has the same origin as one of the given trusted URLs. */
export function isSameOriginAsAny(
  url: string,
  trustedUrls: Array<string | undefined>,
): boolean {
  const origin = originOf(url)
  if (!origin || origin === 'null') return false
  return trustedUrls.some((t) => originOf(t) === origin)
}

/** True when `url` points at an NCSA-hosted endpoint configured in env. */
export function isNCSAHostedUrl(url: string): boolean {
  return isSameOriginAsAny(url, [
    process.env.OLLAMA_SERVER_URL,
    process.env.NCSA_HOSTED_VLM_BASE_URL,
  ])
}

/**
 * Authorization header for an Ollama-style request to `url`. The
 * NCSA_HOSTED_API_KEY is attached only when `url` is an env-configured NCSA
 * endpoint; user-configured endpoints get no server credentials.
 */
export function ncsaHostedAuthHeaders(url: string): Record<string, string> {
  const key = process.env.NCSA_HOSTED_API_KEY
  if (!key || !isNCSAHostedUrl(url)) return {}
  return { Authorization: `Bearer ${key}` }
}
