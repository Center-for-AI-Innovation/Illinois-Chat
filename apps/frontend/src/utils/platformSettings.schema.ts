// Shape and validation for runtime platform settings.
//
// Deliberately Redis-free and browser-safe: this module is imported by the
// /admin form (via a zod resolver) *and* by the API handlers that write to
// Redis, so client and server reject the same inputs with the same messages
// instead of drifting apart. Redis access lives in `platformSettings.server.ts`.

import { z } from 'zod'

export const ANNOUNCEMENT_MESSAGE_MAX_LENGTH = 280
export const ANNOUNCEMENT_LINK_TEXT_MAX_LENGTH = 80
export const ANNOUNCEMENT_LINK_URL_MAX_LENGTH = 2048
export const MAINTENANCE_TITLE_MAX_LENGTH = 120
export const MAINTENANCE_BODY_MAX_LENGTH = 1000

/**
 * Blank, or an absolute `https:` URL.
 *
 * The https-only rule is doing real work here, not box-ticking. `z.string()
 * .url()` is backed by `new URL()`, which happily accepts `javascript:alert(1)`
 * — that string is a structurally valid URL. Since the banner renders this
 * value into an `href` that any visitor can click, the scheme has to be
 * allow-listed rather than merely parseable.
 */
function isBlankOrHttpsUrl(value: string): boolean {
  if (value === '') return true
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'https:'
}

const HTTPS_URL_MESSAGE =
  'Link URL must be an absolute https:// URL (http:// and javascript: are not allowed)'

/**
 * The admin-editable announcement banner fields.
 *
 * Blank strings rather than `undefined` represent "not set", because these bind
 * directly to text inputs, which produce `''` when cleared. `hasBannerLink()`
 * is the single place that decides whether a link exists.
 */
const announcementBannerFields = z.object({
  enabled: z.boolean(),
  message: z
    .string()
    .trim()
    .max(
      ANNOUNCEMENT_MESSAGE_MAX_LENGTH,
      `Message must be ${ANNOUNCEMENT_MESSAGE_MAX_LENGTH} characters or fewer`,
    ),
  linkText: z
    .string()
    .trim()
    .max(
      ANNOUNCEMENT_LINK_TEXT_MAX_LENGTH,
      `Link text must be ${ANNOUNCEMENT_LINK_TEXT_MAX_LENGTH} characters or fewer`,
    ),
  linkUrl: z
    .string()
    .trim()
    .max(
      ANNOUNCEMENT_LINK_URL_MAX_LENGTH,
      `Link URL must be ${ANNOUNCEMENT_LINK_URL_MAX_LENGTH} characters or fewer`,
    )
    .refine(isBlankOrHttpsUrl, HTTPS_URL_MESSAGE),
})

function refineBannerCoherence(
  banner: z.infer<typeof announcementBannerFields>,
  ctx: z.RefinementCtx,
): void {
  // An enabled banner with no message renders as an empty orange bar.
  if (banner.enabled && banner.message === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['message'],
      message: 'Message is required when the banner is enabled',
    })
  }
  // Both-or-neither: link text without a URL is unclickable, and a URL
  // without text has nothing to render.
  if (banner.linkUrl !== '' && banner.linkText === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkText'],
      message: 'Link text is required when a link URL is set',
    })
  }
  if (banner.linkText !== '' && banner.linkUrl === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkUrl'],
      message: 'Link URL is required when link text is set',
    })
  }
}

export const announcementBannerSchema = announcementBannerFields.superRefine(
  refineBannerCoherence,
)
export type AnnouncementBanner = z.infer<typeof announcementBannerSchema>

/**
 * What actually lives in Redis: the editable fields plus write provenance.
 *
 * The audit fields are optional on read so a record written by an earlier
 * version, or hand-edited with redis-cli, still parses instead of making the
 * banner silently unavailable. The coherence rules are applied on read too —
 * an incoherent stored record is treated as invalid, which the home page maps
 * to the legacy fallback rather than rendering a broken bar.
 */
export const storedAnnouncementBannerSchema = announcementBannerFields
  .extend({
    updatedAt: z.string().optional(),
    updatedBy: z.string().optional(),
  })
  .superRefine(refineBannerCoherence)
export type StoredAnnouncementBanner = z.infer<
  typeof storedAnnouncementBannerSchema
>

export const maintenanceSettingsSchema = z.object({
  enabled: z.boolean(),
  titleText: z
    .string()
    .trim()
    .max(
      MAINTENANCE_TITLE_MAX_LENGTH,
      `Title must be ${MAINTENANCE_TITLE_MAX_LENGTH} characters or fewer`,
    ),
  bodyText: z
    .string()
    .trim()
    .max(
      MAINTENANCE_BODY_MAX_LENGTH,
      `Body must be ${MAINTENANCE_BODY_MAX_LENGTH} characters or fewer`,
    ),
})
export type MaintenanceSettings = z.infer<typeof maintenanceSettingsSchema>

export const platformSettingsSchema = z.object({
  announcementBanner: announcementBannerSchema,
  maintenance: maintenanceSettingsSchema,
})
export type PlatformSettings = z.infer<typeof platformSettingsSchema>

export const superAdminEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address')

export const addSuperAdminBodySchema = z.object({
  email: superAdminEmailSchema,
})

export const removeSuperAdminQuerySchema = z.object({
  email: superAdminEmailSchema,
})

/**
 * Whether the banner has a renderable link. Kept next to the schema so the
 * renderer, the live preview, and the validators agree on what "has a link"
 * means.
 */
export function hasBannerLink(
  banner: Pick<AnnouncementBanner, 'linkText' | 'linkUrl'>,
): boolean {
  return banner.linkText !== '' && banner.linkUrl !== ''
}

export const EMPTY_ANNOUNCEMENT_BANNER: AnnouncementBanner = {
  enabled: false,
  message: '',
  linkText: '',
  linkUrl: '',
}

export const EMPTY_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  enabled: false,
  titleText: '',
  bodyText: '',
}
