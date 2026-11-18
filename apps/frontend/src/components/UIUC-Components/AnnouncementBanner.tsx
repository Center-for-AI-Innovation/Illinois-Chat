import { montserrat_heading } from 'fonts'
import type { ReactNode } from 'react'
import {
  hasBannerLink,
  type AnnouncementBanner as AnnouncementBannerValue,
} from '~/utils/platformSettings.schema'

/**
 * Height of the empty splash strip, measured on chat.illinois.edu and the
 * pre-stack main at 390px and 1440px. The splash header is this strip plus the
 * 72px splash navbar: 41 + 72 = 113px.
 */
export const EMPTY_SPLASH_STRIP_HEIGHT = '41px'

interface AnnouncementBannerProps {
  /**
   * The stored banner, or `null` when Redis holds no usable configuration.
   *
   * The distinction matters and must survive the props boundary: a *configured
   * but disabled* banner renders nothing, whereas an *unconfigured* one falls
   * through to the legacy env/rebranding chain. Collapsing "disabled" to
   * `null` would make switching the banner off resurrect the old build-time
   * banner instead of clearing the bar.
   */
  banner?: AnnouncementBannerValue | null
  /**
   * Renders the bar without the `Site announcement` landmark, for the /admin
   * live preview — the real page already owns that landmark, and a second one
   * inside the admin console is a duplicate label for screen readers.
   */
  preview?: boolean
  /**
   * Whether an unconfigured banner falls through to the legacy env/rebranding
   * chain. Only the home page opts in; elsewhere "no banner" means no bar.
   */
  legacyFallback?: boolean
  /**
   * Keeps an empty, decorative orange strip when there is no active message
   * (disabled, cleared, or no legacy fallback). Only the splash page opts in,
   * so its navbar keeps the bar above it. The strip has no text and no
   * `Site announcement` landmark. Off by default: elsewhere no message means
   * no bar and no occupied space.
   */
  preserveEmptySpace?: boolean
}

/**
 * Resolves what the bar should contain, in strict precedence order.
 *
 * Returning `null` means there is no message to show. Whether an empty strip
 * is kept in that case is decided by the caller (`preserveEmptySpace`).
 */
function resolveBannerContent(
  banner: AnnouncementBannerValue | null,
  legacyFallback: boolean,
): ReactNode | null {
  if (banner) {
    if (!banner.enabled) return null
    return (
      <>
        {banner.message}
        {hasBannerLink(banner) && (
          <>
            {' '}
            <a href={banner.linkUrl} className="underline" tabIndex={0}>
              {banner.linkText}
            </a>
          </>
        )}
      </>
    )
  }

  if (!legacyFallback) return null

  // Legacy fallbacks, unchanged from the build-time banner this replaced.
  const useIllinoisChatConfig =
    process.env.NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG?.toLowerCase() === 'true'
  const envBannerContent =
    process.env.NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT || null

  if (useIllinoisChatConfig && envBannerContent) {
    // Raw HTML is retained only on this legacy path: the value is a build-time
    // env var set by whoever deploys the image, not runtime input. Anything
    // authored through /admin goes through the structured branch above and is
    // rendered as text.
    return <div dangerouslySetInnerHTML={{ __html: envBannerContent }} />
  }
  if (!useIllinoisChatConfig) {
    return (
      <>
        Heads up: we&rsquo;ve rebranded to Illinois Chat &mdash; please visit{' '}
        <a href="https://chat.illinois.edu" className="underline" tabIndex={0}>
          chat.illinois.edu
        </a>
      </>
    )
  }
  return null
}

/**
 * The orange announcement bar. Mounted site-wide by `SiteAnnouncementBanner`.
 *
 * Content comes from Redis at runtime (see `platformSettings.server.ts`), which
 * is why the same component backs the /admin live preview — what an operator
 * previews is literally the component that ships.
 */
export function AnnouncementBanner({
  banner = null,
  preview = false,
  legacyFallback = true,
  preserveEmptySpace = false,
}: AnnouncementBannerProps) {
  const content = resolveBannerContent(banner, legacyFallback)

  const className = 'relative w-full py-2 text-center'
  const style = {
    background: 'var(--illinois-orange)',
    color: 'var(--illinois-white)',
  }

  if (!content) {
    // Empty decorative strip, hidden from assistive tech. Nothing is announced,
    // so there is no landmark. It is fixed at the splash page's measured height,
    // so the header keeps its 113px total (strip + navbar). Active messages
    // below are not constrained and grow with their text.
    if (!preserveEmptySpace) return null
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{ ...style, height: EMPTY_SPLASH_STRIP_HEIGHT }}
      />
    )
  }

  const inner = (
    <div
      className={`inline-block ${montserrat_heading.variable} font-montserratHeading`}
    >
      <span className="text-lg font-bold">{content}</span>
    </div>
  )

  if (preview) {
    return (
      <div className={className} style={style}>
        {inner}
      </div>
    )
  }

  return (
    <section aria-label="Site announcement" className={className} style={style}>
      {inner}
    </section>
  )
}

export default AnnouncementBanner
