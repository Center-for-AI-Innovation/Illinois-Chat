// Server-only super-admin membership: the env allowlist unioned with the
// Redis-backed grants managed from /admin.
//
// `superAdmins.ts` stays Redis-free because browser components import it.
// This module imports Redis and must only be reached from API routes,
// `getServerSideProps`, and `getStaticProps`.

import {
  addSuperAdminGrant,
  readSuperAdminGrants,
  removeSuperAdminGrant,
} from '~/utils/platformSettings.server'
import { isSuperAdmin, superAdmins } from '~/utils/superAdmins'

/**
 * Whether the email is a super admin, by env allowlist or Redis grant.
 *
 * The env check runs first so a Redis outage degrades to the env answer
 * instead of denying everyone. That ordering is the whole safety property: if
 * Redis is the only source of truth and it is unreachable, nobody can reach
 * /admin to fix it.
 *
 * Grants are checked live on every call rather than persisted into project
 * metadata, which is what makes revocation immediate and complete.
 */
export async function isSuperAdminAsync(
  email?: string | null,
): Promise<boolean> {
  if (!email) return false
  const normalized = email.toLowerCase()

  if (isSuperAdmin(normalized)) return true

  const grants = await readSuperAdminGrants()
  if (grants.state !== 'configured') {
    // Redis unavailable. The env answer was already `false`, so returning
    // false is correct here — we are not denying an env admin, only declining
    // to confirm a grant we cannot read.
    return false
  }
  return grants.value.includes(normalized)
}

export interface SuperAdminRoster {
  /** From SUPER_ADMIN_EMAILS / NEXT_PUBLIC_SUPER_ADMIN_EMAILS. Read-only. */
  envAdmins: string[]
  /** From the platform:super_admins Redis set. Editable through /admin. */
  grantedAdmins: string[]
  /** Set when the Redis set could not be read. */
  warning?: string
}

/**
 * The full roster, split by source so the UI can render env entries as
 * read-only. Env entries are excluded from `grantedAdmins` even if the same
 * address also sits in Redis, so each email appears exactly once.
 */
export async function readSuperAdminRoster(): Promise<SuperAdminRoster> {
  const grants = await readSuperAdminGrants()
  if (grants.state !== 'configured') {
    return {
      envAdmins: [...superAdmins].sort(),
      grantedAdmins: [],
      warning: `Redis-granted admins could not be read (${grants.reason}). Showing environment admins only.`,
    }
  }
  return {
    envAdmins: [...superAdmins].sort(),
    grantedAdmins: grants.value.filter((email) => !isSuperAdmin(email)),
  }
}

export { addSuperAdminGrant, removeSuperAdminGrant }
