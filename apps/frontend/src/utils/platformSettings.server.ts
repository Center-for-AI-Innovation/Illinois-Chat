// Server-only Redis accessors for runtime platform settings.
//
// Kept separate from `platformSettings.schema.ts` because this module imports
// the `redis` package. The schema module is pulled into the client bundle by
// the /admin form; this one must never be.
//
// Redis layout (additive — nothing existing is renamed or migrated):
//   platform:settings      hash  field `announcement_banner` holds JSON
//                                field `navbar_branding` holds JSON
//                                field `navbar_logo` holds a data URL or ''
//                                field `version` holds the optimistic-lock token
//   platform:super_admins  set   lowercased emails granted through the UI
//   maintenance-mode       string 'true' | anything else
//   maintenance-title-text string
//   maintenance-body-text  string

import { createHash, randomUUID } from 'node:crypto'
import type { ZodType, ZodTypeDef } from 'zod'
import { ensureRedisConnected } from '~/utils/redisClient'
import {
  DEFAULT_NAVBAR_BRANDING,
  DEFAULT_NAVBAR_BRANDING_SETTINGS,
  EMPTY_ANNOUNCEMENT_BANNER,
  EMPTY_MAINTENANCE_SETTINGS,
  platformSettingsUpdateSchema,
  storedAnnouncementBannerSchema,
  storedNavbarBrandingSchema,
  type AnnouncementBanner,
  type MaintenanceSettings,
  type NavbarBranding,
  type NavbarBrandingSettings,
  type PlatformSettings,
  type PlatformSettingsUpdate,
  type StoredAnnouncementBanner,
  type StoredNavbarBranding,
} from '~/utils/platformSettings.schema'

export const PLATFORM_SETTINGS_KEY = 'platform:settings'
export const ANNOUNCEMENT_BANNER_FIELD = 'announcement_banner'
export const NAVBAR_BRANDING_FIELD = 'navbar_branding'
export const NAVBAR_LOGO_FIELD = 'navbar_logo'
export const NAVBAR_LOGO_ENDPOINT = '/api/UIUC-api/navbarLogo'
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

function parseStoredJson<T>(
  raw: string | null | undefined,
  field: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): SettingsRead<T> {
  if (!raw) return { state: 'absent' }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (error) {
    const reason = `${field} is not valid JSON: ${describeError(error)}`
    console.error('[platformSettings]', reason)
    return { state: 'invalid', reason }
  }

  const parsed = schema.safeParse(parsedJson)
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || field}: ${issue.message}`)
      .join('; ')
    console.error(
      `[platformSettings] Stored ${field} failed validation:`,
      reason,
    )
    return { state: 'invalid', reason }
  }

  return { state: 'configured', value: parsed.data }
}

/**
 * Reads one JSON field from the platform settings hash.
 *
 * Never throws. Banner reads run inside `getStaticProps`, which Next also
 * executes at Docker build time when Redis is unreachable — throwing there
 * fails the image build. ISR fills in the real value on the first live request.
 */
async function readJsonField<T>(
  field: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<SettingsRead<T>> {
  let raw: string | undefined
  try {
    const redis = await ensureRedisConnected()
    raw = await redis.hGet(PLATFORM_SETTINGS_KEY, field)
  } catch (error) {
    const reason = describeError(error)
    console.error(
      `[platformSettings] Redis unavailable reading ${field}:`,
      reason,
    )
    return { state: 'unavailable', reason }
  }

  return parseStoredJson(raw, field, schema)
}

export function readAnnouncementBanner(): Promise<
  SettingsRead<StoredAnnouncementBanner>
> {
  return readJsonField(
    ANNOUNCEMENT_BANNER_FIELD,
    storedAnnouncementBannerSchema,
  )
}

/** Never throws, for the same build-time reason as `readAnnouncementBanner`. */
export function readNavbarBranding(): Promise<
  SettingsRead<StoredNavbarBranding>
> {
  return readJsonField(NAVBAR_BRANDING_FIELD, storedNavbarBrandingSchema)
}

/** The uploaded logo as a data URL, or `''` when the built-in logo is in use. */
export async function readNavbarLogo(): Promise<AvailabilityRead<string>> {
  try {
    const redis = await ensureRedisConnected()
    const raw = await redis.hGet(PLATFORM_SETTINGS_KEY, NAVBAR_LOGO_FIELD)
    return { state: 'configured', value: raw ?? '' }
  } catch (error) {
    const reason = describeError(error)
    console.error('[platformSettings] Redis unavailable reading logo:', reason)
    return { state: 'unavailable', reason }
  }
}

/**
 * Every state other than `configured` renders the built-in branding: unlike
 * the banner there is no legacy chain, and a navbar must always have a name.
 */
export function toPublicNavbarBranding(
  read: SettingsRead<StoredNavbarBranding>,
): NavbarBranding {
  if (read.state !== 'configured') return DEFAULT_NAVBAR_BRANDING
  const { primaryWord, secondaryWord, logoVersion } = read.value
  return {
    primaryWord,
    secondaryWord,
    logoUrl: logoVersion
      ? `${NAVBAR_LOGO_ENDPOINT}?v=${encodeURIComponent(logoVersion)}`
      : null,
  }
}

function logoVersionOf(logoDataUrl: string): string {
  if (logoDataUrl === '') return ''
  return createHash('sha256').update(logoDataUrl).digest('hex').slice(0, 16)
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
  version: string
  bannerState: SettingsRead<StoredAnnouncementBanner>['state']
  /** Present when a banner, navbar, or maintenance read did not succeed. */
  warning?: string
  updatedAt?: string
  updatedBy?: string
}

/**
 * Everything the admin form needs in one call, with unreadable pieces reported
 * as a warning rather than as saved state.
 *
 * The version and the values are read in one transaction, so a concurrent save
 * cannot pair old form values with a new version.
 */
export async function readPlatformSettings(): Promise<PlatformSettingsSnapshot> {
  let banner: SettingsRead<StoredAnnouncementBanner>
  let branding: SettingsRead<StoredNavbarBranding>
  let logo: AvailabilityRead<string>
  let maintenance: AvailabilityRead<MaintenanceSettings>
  let version = '0'
  let updatedAt: string | undefined
  let updatedBy: string | undefined
  try {
    const redis = await ensureRedisConnected()
    const [
      rawBanner,
      rawBranding,
      rawLogo,
      mode,
      title,
      body,
      rawVersion,
      savedAt,
      savedBy,
    ] = await redis
      .multi()
      .hGet(PLATFORM_SETTINGS_KEY, ANNOUNCEMENT_BANNER_FIELD)
      .hGet(PLATFORM_SETTINGS_KEY, NAVBAR_BRANDING_FIELD)
      .hGet(PLATFORM_SETTINGS_KEY, NAVBAR_LOGO_FIELD)
      .get(MAINTENANCE_MODE_KEY)
      .get(MAINTENANCE_TITLE_KEY)
      .get(MAINTENANCE_BODY_KEY)
      .hGet(PLATFORM_SETTINGS_KEY, 'version')
      .hGet(PLATFORM_SETTINGS_KEY, 'updated_at')
      .hGet(PLATFORM_SETTINGS_KEY, 'updated_by')
      .exec()
    banner = parseStoredJson(
      rawBanner as string | null,
      ANNOUNCEMENT_BANNER_FIELD,
      storedAnnouncementBannerSchema,
    )
    branding = parseStoredJson(
      rawBranding as string | null,
      NAVBAR_BRANDING_FIELD,
      storedNavbarBrandingSchema,
    )
    logo = { state: 'configured', value: (rawLogo as string | null) ?? '' }
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
    branding = { state: 'unavailable', reason }
    logo = { state: 'unavailable', reason }
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
  if (branding.state === 'invalid' || branding.state === 'unavailable') {
    warnings.push(`Navbar branding could not be read (${branding.reason})`)
  }
  if (logo.state === 'unavailable') {
    warnings.push(`Navbar logo could not be read (${logo.reason})`)
  }

  const navbarBranding: NavbarBrandingSettings =
    branding.state === 'configured'
      ? {
          primaryWord: branding.value.primaryWord,
          secondaryWord: branding.value.secondaryWord,
          // A version with no bytes behind it would render a broken image, so
          // the form only shows a logo when both halves are present.
          logoDataUrl:
            branding.value.logoVersion && logo.state === 'configured'
              ? logo.value
              : '',
        }
      : DEFAULT_NAVBAR_BRANDING_SETTINGS

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
      navbarBranding,
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
// shared Redis connection. Omitted sections remain untouched. Navbar branding
// and its logo are one section: the logo bytes are stored only when branding
// is part of this save, including a `''` logo that restores the built-in mark.
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
if ARGV[9] ~= '' then
  redis.call('HSET', KEYS[1], 'navbar_branding', ARGV[9], 'navbar_logo', ARGV[10])
end
redis.call('HSET', KEYS[1], 'version', ARGV[2], 'updated_at', ARGV[7], 'updated_by', ARGV[8])
return 1
`

/**
 * Validates then persists the included settings sections in one script.
 *
 * The script matters: the banner, navbar branding, logo, and maintenance keys
 * are one logical save, and a partial apply could leave maintenance on with
 * the previous notice copy — or a new logo version with the previous bytes.
 * The version argument rejects a save that lost a concurrent edit. Validation
 * runs before the script so a bad payload never touches Redis.
 *
 * Throws on validation failure, on a version conflict, and on Redis failure;
 * the caller maps those to 400, 409, and 503. Unlike the read path this must
 * not swallow errors, since a silent write failure would read as a successful
 * save.
 */
export async function writePlatformSettings(
  input: PlatformSettingsUpdate,
  updatedBy: string,
): Promise<{ updatedAt: string; version: string }> {
  const settings = platformSettingsUpdateSchema.parse(input)
  const updatedAt = new Date().toISOString()
  const version = randomUUID()

  const storedBranding: StoredNavbarBranding | undefined =
    settings.navbarBranding
      ? {
          primaryWord: settings.navbarBranding.primaryWord,
          secondaryWord: settings.navbarBranding.secondaryWord,
          logoVersion: logoVersionOf(settings.navbarBranding.logoDataUrl),
          updatedAt,
          updatedBy,
        }
      : undefined

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
      storedBranding ? JSON.stringify(storedBranding) : '',
      settings.navbarBranding?.logoDataUrl ?? '',
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
      value: [...new Set(members.map((email) => email.toLowerCase()))].sort(),
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

// Remove all case variants and check the last-admin rule in the same operation.
const REMOVE_GRANT_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
local others = 0
local matches = {}
for _, email in ipairs(members) do
  if string.lower(email) == ARGV[1] then
    table.insert(matches, email)
  else
    others = others + 1
  end
end
if ARGV[2] == 'true' and #matches > 0 and others == 0 then return 0 end
for _, email in ipairs(matches) do redis.call('SREM', KEYS[1], email) end
return 1
`

export async function removeSuperAdminGrant(
  email: string,
  protectLast = false,
): Promise<boolean> {
  const redis = await ensureRedisConnected()
  return (
    (await redis.eval(REMOVE_GRANT_SCRIPT, {
      keys: [SUPER_ADMINS_KEY],
      arguments: [email.toLowerCase(), String(protectLast)],
    })) === 1
  )
}
