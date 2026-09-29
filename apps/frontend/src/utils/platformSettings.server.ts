// Server-only Redis accessors for runtime platform settings.
//
// Kept separate from `platformSettings.schema.ts` because this module imports
// the `redis` package. The schema module is pulled into the client bundle by
// the /admin form; this one must never be.
//
// Redis layout (additive — nothing existing is renamed or migrated):
//   platform:settings      hash  field `announcement_banner` holds JSON
//   platform:super_admins  set   lowercased emails granted through the UI
//   maintenance-mode       string 'true' | anything else
//   maintenance-title-text string
//   maintenance-body-text  string

import { ensureRedisConnected } from '~/utils/redisClient'
import {
  EMPTY_ANNOUNCEMENT_BANNER,
  EMPTY_MAINTENANCE_SETTINGS,
  platformSettingsSchema,
  storedAnnouncementBannerSchema,
  type AnnouncementBanner,
  type MaintenanceSettings,
  type PlatformSettings,
  type StoredAnnouncementBanner,
} from '~/utils/platformSettings.schema'

export const PLATFORM_SETTINGS_KEY = 'platform:settings'
export const ANNOUNCEMENT_BANNER_FIELD = 'announcement_banner'
export const SUPER_ADMINS_KEY = 'platform:super_admins'
export const MAINTENANCE_MODE_KEY = 'maintenance-mode'
export const MAINTENANCE_TITLE_KEY = 'maintenance-title-text'
export const MAINTENANCE_BODY_KEY = 'maintenance-body-text'

/**
 * Result of a settings read.
 *
 * Callers need to distinguish these because they mean different things: the
 * home page falls through to its legacy banner for everything except
 * `configured`, but the admin UI should tell an operator that Redis is down
 * rather than showing them an empty form that looks like saved state.
 *
 * `invalid` means a record exists but does not satisfy the schema — corrupt
 * JSON, a hand-edit, or a record from a future version.
 */
export type SettingsRead<T> =
  | { state: 'configured'; value: T }
  | { state: 'absent' }
  | { state: 'invalid'; reason: string }
  | { state: 'unavailable'; reason: string }

/**
 * Narrower result for reads that have no "absent" or "invalid" case — an
 * unset key is a legitimate value, so the only failure is Redis itself.
 */
export type AvailabilityRead<T> =
  | { state: 'configured'; value: T }
  | { state: 'unavailable'; reason: string }

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Reads the stored announcement banner.
 *
 * Never throws. This runs inside `getStaticProps`, which Next also executes at
 * Docker build time when Redis is unreachable — throwing there fails the
 * image build. ISR fills in the real value on the first live request.
 */
export async function readAnnouncementBanner(): Promise<
  SettingsRead<StoredAnnouncementBanner>
> {
  let raw: string | undefined
  try {
    const redis = await ensureRedisConnected()
    raw = await redis.hGet(PLATFORM_SETTINGS_KEY, ANNOUNCEMENT_BANNER_FIELD)
  } catch (error) {
    const reason = describeError(error)
    console.error(
      '[platformSettings] Redis unavailable reading banner:',
      reason,
    )
    return { state: 'unavailable', reason }
  }

  if (!raw) return { state: 'absent' }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (error) {
    const reason = `announcement_banner is not valid JSON: ${describeError(
      error,
    )}`
    console.error('[platformSettings]', reason)
    return { state: 'invalid', reason }
  }

  const parsed = storedAnnouncementBannerSchema.safeParse(parsedJson)
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'banner'}: ${issue.message}`)
      .join('; ')
    console.error('[platformSettings] Stored banner failed validation:', reason)
    return { state: 'invalid', reason }
  }

  return { state: 'configured', value: parsed.data }
}

/**
 * The banner as public pages may see it. Only a genuinely configured record
 * becomes non-null; every other state maps to null, which is what makes the
 * legacy fallback fire for those cases and *only* those cases.
 *
 * `updatedAt`/`updatedBy` are stripped rather than spread: `updatedBy` is an
 * administrator's email address.
 */
export function toPublicAnnouncementBanner(
  read: SettingsRead<StoredAnnouncementBanner>,
): AnnouncementBanner | null {
  if (read.state !== 'configured') return null
  const { enabled, message, linkText, linkUrl } = read.value
  return { enabled, message, linkText, linkUrl }
}

/**
 * Reads maintenance mode plus its notice copy.
 *
 * Absent keys are a legitimate steady state (maintenance has simply never been
 * configured), so this reports `configured` with `enabled: false` rather than
 * `absent` — there is no fallback chain for maintenance the way there is for
 * the banner.
 */
export async function readMaintenanceSettings(): Promise<
  AvailabilityRead<MaintenanceSettings>
> {
  try {
    const redis = await ensureRedisConnected()
    const [mode, titleText, bodyText] = await Promise.all([
      redis.get(MAINTENANCE_MODE_KEY),
      redis.get(MAINTENANCE_TITLE_KEY),
      redis.get(MAINTENANCE_BODY_KEY),
    ])
    return {
      state: 'configured',
      value: {
        enabled: mode === 'true',
        titleText: titleText ?? '',
        bodyText: bodyText ?? '',
      },
    }
  } catch (error) {
    const reason = describeError(error)
    console.error(
      '[platformSettings] Redis unavailable reading maintenance settings:',
      reason,
    )
    return { state: 'unavailable', reason }
  }
}

export interface PlatformSettingsSnapshot {
  settings: PlatformSettings
  bannerState: SettingsRead<StoredAnnouncementBanner>['state']
  /** Present when the banner or maintenance read did not succeed. */
  warning?: string
  updatedAt?: string
  updatedBy?: string
}

/**
 * Everything the admin form needs in one call, with unreadable pieces reported
 * as a warning rather than as saved state.
 */
export async function readPlatformSettings(): Promise<PlatformSettingsSnapshot> {
  const [banner, maintenance] = await Promise.all([
    readAnnouncementBanner(),
    readMaintenanceSettings(),
  ])

  const warnings: string[] = []
  if (banner.state === 'invalid' || banner.state === 'unavailable') {
    warnings.push(`Announcement banner could not be read (${banner.reason})`)
  }
  if (maintenance.state === 'unavailable') {
    warnings.push(
      `Maintenance settings could not be read (${maintenance.reason})`,
    )
  }

  return {
    settings: {
      announcementBanner:
        banner.state === 'configured'
          ? {
              enabled: banner.value.enabled,
              message: banner.value.message,
              linkText: banner.value.linkText,
              linkUrl: banner.value.linkUrl,
            }
          : EMPTY_ANNOUNCEMENT_BANNER,
      maintenance:
        maintenance.state === 'configured'
          ? maintenance.value
          : EMPTY_MAINTENANCE_SETTINGS,
    },
    bannerState: banner.state,
    warning: warnings.length > 0 ? warnings.join('. ') : undefined,
    updatedAt:
      banner.state === 'configured' ? banner.value.updatedAt : undefined,
    updatedBy:
      banner.state === 'configured' ? banner.value.updatedBy : undefined,
  }
}

/**
 * Validates then persists every settings key in one `MULTI`.
 *
 * The transaction matters: the banner field and the three maintenance keys are
 * one logical save, and a partial apply could leave maintenance on with the
 * previous notice copy — or, worse, the banner updated while maintenance
 * silently did not change. Validation runs before the transaction opens so a
 * bad payload never touches Redis.
 *
 * Throws on validation failure and on Redis failure; the caller maps those to
 * 400 and 503. Unlike the read path this must not swallow errors, since a
 * silent write failure would read as a successful save.
 */
export async function writePlatformSettings(
  input: PlatformSettings,
  updatedBy: string,
): Promise<{ updatedAt: string }> {
  const settings = platformSettingsSchema.parse(input)
  const updatedAt = new Date().toISOString()

  const storedBanner: StoredAnnouncementBanner = {
    ...settings.announcementBanner,
    updatedAt,
    updatedBy,
  }

  const redis = await ensureRedisConnected()
  await redis
    .multi()
    .hSet(
      PLATFORM_SETTINGS_KEY,
      ANNOUNCEMENT_BANNER_FIELD,
      JSON.stringify(storedBanner),
    )
    .set(MAINTENANCE_MODE_KEY, settings.maintenance.enabled ? 'true' : 'false')
    .set(MAINTENANCE_TITLE_KEY, settings.maintenance.titleText)
    .set(MAINTENANCE_BODY_KEY, settings.maintenance.bodyText)
    .exec()

  return { updatedAt }
}

/**
 * Emails granted super-admin from the UI. Never throws — see
 * `isSuperAdminAsync`, which must be able to fall back to the env allowlist
 * when Redis is down so an outage cannot lock out every operator.
 */
export async function readSuperAdminGrants(): Promise<
  AvailabilityRead<string[]>
> {
  try {
    const redis = await ensureRedisConnected()
    const members = await redis.sMembers(SUPER_ADMINS_KEY)
    return {
      state: 'configured',
      value: members.map((email) => email.toLowerCase()).sort(),
    }
  } catch (error) {
    const reason = describeError(error)
    console.error(
      '[platformSettings] Redis unavailable reading super-admin grants:',
      reason,
    )
    return { state: 'unavailable', reason }
  }
}

export async function addSuperAdminGrant(email: string): Promise<void> {
  const redis = await ensureRedisConnected()
  await redis.sAdd(SUPER_ADMINS_KEY, email.toLowerCase())
}

export async function removeSuperAdminGrant(email: string): Promise<void> {
  const redis = await ensureRedisConnected()
  await redis.sRem(SUPER_ADMINS_KEY, email.toLowerCase())
}
