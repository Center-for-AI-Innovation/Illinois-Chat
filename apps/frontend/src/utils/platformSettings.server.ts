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

import { randomUUID } from 'node:crypto'
import { ensureRedisConnected } from '~/utils/redisClient'
import {
  EMPTY_ANNOUNCEMENT_BANNER,
  EMPTY_MAINTENANCE_SETTINGS,
  platformSettingsUpdateSchema,
  storedAnnouncementBannerSchema,
  type MaintenanceSettings,
  type PlatformSettings,
  type PlatformSettingsUpdate,
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

  return parseAnnouncementBanner(raw)
}

function parseAnnouncementBanner(
  raw: string | null | undefined,
): SettingsRead<StoredAnnouncementBanner> {
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
  version: string
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
  let banner: SettingsRead<StoredAnnouncementBanner>
  let maintenance: AvailabilityRead<MaintenanceSettings>
  let version = '0'
  let updatedAt: string | undefined
  let updatedBy: string | undefined
  try {
    const redis = await ensureRedisConnected()
    // Read the version and its values in one transaction, so a concurrent save
    // cannot pair old form values with a new version.
    const [rawBanner, mode, title, body, rawVersion, savedAt, savedBy] =
      await redis
        .multi()
        .hGet(PLATFORM_SETTINGS_KEY, ANNOUNCEMENT_BANNER_FIELD)
        .get(MAINTENANCE_MODE_KEY)
        .get(MAINTENANCE_TITLE_KEY)
        .get(MAINTENANCE_BODY_KEY)
        .hGet(PLATFORM_SETTINGS_KEY, 'version')
        .hGet(PLATFORM_SETTINGS_KEY, 'updated_at')
        .hGet(PLATFORM_SETTINGS_KEY, 'updated_by')
        .exec()
    banner = parseAnnouncementBanner(rawBanner as string | null)
    maintenance = {
      state: 'configured',
      value: {
        enabled: mode === 'true',
        titleText: (title as string | null) ?? '',
        bodyText: (body as string | null) ?? '',
      },
    }
    version = (rawVersion as string | null) ?? '0'
    updatedAt = (savedAt as string | null) ?? undefined
    updatedBy = (savedBy as string | null) ?? undefined
  } catch (error) {
    const reason = describeError(error)
    banner = { state: 'unavailable', reason }
    maintenance = { state: 'unavailable', reason }
  }

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
    version,
    bannerState: banner.state,
    warning: warnings.length > 0 ? warnings.join('. ') : undefined,
    updatedAt:
      updatedAt ??
      (banner.state === 'configured' ? banner.value.updatedAt : undefined),
    updatedBy:
      updatedBy ??
      (banner.state === 'configured' ? banner.value.updatedBy : undefined),
  }
}

export class PlatformSettingsConflictError extends Error {
  constructor() {
    super(
      'Settings changed since you loaded this form. Reload the latest settings before saving.',
    )
  }
}

// Lua keeps the version check and writes atomic without WATCH state on the
// shared Redis connection. Omitted sections remain untouched.
const SAVE_SETTINGS_SCRIPT = `
for i, key in ipairs(KEYS) do
  local kind = redis.call('TYPE', key).ok
  local expected = i == 1 and 'hash' or 'string'
  if kind ~= 'none' and kind ~= expected then
    return redis.error_reply('Unexpected settings key type')
  end
end
local version = redis.call('HGET', KEYS[1], 'version') or '0'
if version ~= ARGV[1] then return 0 end
if ARGV[3] ~= '' then
  redis.call('HSET', KEYS[1], 'announcement_banner', ARGV[3])
end
if ARGV[4] ~= '' then
  redis.call('SET', KEYS[2], ARGV[4])
  redis.call('SET', KEYS[3], ARGV[5])
  redis.call('SET', KEYS[4], ARGV[6])
end
redis.call('HSET', KEYS[1], 'version', ARGV[2], 'updated_at', ARGV[7], 'updated_by', ARGV[8])
return 1
`

export async function writePlatformSettings(
  input: PlatformSettingsUpdate,
  updatedBy: string,
): Promise<{ updatedAt: string; version: string }> {
  const settings = platformSettingsUpdateSchema.parse(input)
  const updatedAt = new Date().toISOString()
  const version = randomUUID()
  const redis = await ensureRedisConnected()
  const saved = await redis.eval(SAVE_SETTINGS_SCRIPT, {
    keys: [
      PLATFORM_SETTINGS_KEY,
      MAINTENANCE_MODE_KEY,
      MAINTENANCE_TITLE_KEY,
      MAINTENANCE_BODY_KEY,
    ],
    arguments: [
      settings.version,
      version,
      settings.announcementBanner
        ? JSON.stringify({
            ...settings.announcementBanner,
            updatedAt,
            updatedBy,
          })
        : '',
      settings.maintenance
        ? settings.maintenance.enabled
          ? 'true'
          : 'false'
        : '',
      settings.maintenance?.titleText ?? '',
      settings.maintenance?.bodyText ?? '',
      updatedAt,
      updatedBy,
    ],
  })
  if (saved === 0) throw new PlatformSettingsConflictError()
  return { updatedAt, version }
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
