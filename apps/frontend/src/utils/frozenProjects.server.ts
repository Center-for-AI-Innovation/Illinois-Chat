// Super-admin recovery for frozen projects. Server-only.
//
// Redis `course_metadatas` is the source of truth, so listings read it
// directly rather than the Postgres projection, which can lag.
//
// Recovery is the only path that clears `is_frozen`, and it is deliberately
// narrow: it flips `true` to `false` and leaves every other field as stored.
// Ordinary metadata routes keep refusing frozen projects.

import { eq } from 'drizzle-orm'
import { db, projectConnectionAuditLog } from '~/db/dbClient'
import type { NewProjectConnectionAuditLog } from '~/db/schema'
import {
  CourseMetadataWriteError,
  REDIS_HASH,
  parseStoredCourseMetadata,
  readCourseMetadataRaw,
  writeCourseMetadata,
} from '~/utils/courseMetadataStore'
import { ensureRedisConnected } from '~/utils/redisClient'
import type { CourseMetadata } from '~/types/courseMetadata'

// Bounded per round trip. HSCAN can return the same field more than once while
// the hash is being modified, so results are keyed by project name.
const SCAN_COUNT = 500

export interface FrozenProjectSummary {
  course_name: string
  course_owner: string | null
  is_private: boolean
}

export type AuditMeta = Pick<
  NewProjectConnectionAuditLog,
  'source_ip' | 'user_agent' | 'request_id'
>

export type RecoveryOutcome =
  | { status: 'recovered'; auditId: number }
  | { status: 'not_found' }
  | { status: 'not_frozen' }

/**
 * Failures the route maps to specific responses. `CourseMetadataWriteError`
 * from the store is passed through unchanged.
 *
 * - `audit_unavailable`: the pre-write audit row could not be recorded, so
 *   nothing was changed.
 * - `unreadable_metadata`: the stored JSON does not parse, so the rest of the
 *   record cannot be preserved and recovery is refused.
 * - `audit_not_finalized`: the project was unfrozen, but the audit row could
 *   not be moved from `pending` to `success`.
 */
export class FrozenProjectRecoveryError extends Error {
  public readonly code:
    | 'audit_unavailable'
    | 'unreadable_metadata'
    | 'audit_not_finalized'
  public readonly cause?: unknown
  constructor(
    code: FrozenProjectRecoveryError['code'],
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'FrozenProjectRecoveryError'
    this.code = code
    this.cause = cause
  }
}

function parseStoredMetadata(raw: string, courseName: string): CourseMetadata {
  const record = parseStoredCourseMetadata(raw)
  if (!record) {
    throw new FrozenProjectRecoveryError(
      'unreadable_metadata',
      `Stored metadata for ${courseName} is not a JSON object`,
    )
  }
  return record
}

/**
 * Every frozen project in Redis, with only the fields an operator needs to
 * identify it. Prompts, connection settings, and approved email lists are never
 * read into the response.
 */
export async function listFrozenProjects(): Promise<FrozenProjectSummary[]> {
  const client = await ensureRedisConnected()
  const frozen = new Map<string, FrozenProjectSummary>()

  let cursor = 0
  do {
    const page = await client.hScan(REDIS_HASH, cursor, { COUNT: SCAN_COUNT })
    cursor = page.cursor
    for (const { field, value } of page.tuples) {
      const metadata = parseStoredCourseMetadata(value)
      if (!metadata) {
        // One bad record must not take down the whole list.
        console.error('[frozenProjects] skipping malformed metadata', {
          courseName: field,
        })
        continue
      }
      if (metadata.is_frozen !== true) continue
      frozen.set(field, {
        course_name: field,
        course_owner:
          typeof metadata.course_owner === 'string'
            ? metadata.course_owner
            : null,
        is_private: metadata.is_private === true,
      })
    }
  } while (cursor !== 0)

  return [...frozen.values()].sort((a, b) =>
    a.course_name.localeCompare(b.course_name),
  )
}

async function openAuditEntry(
  entry: Omit<NewProjectConnectionAuditLog, 'id' | 'occurred_at'>,
): Promise<number> {
  let row: { id: number } | undefined
  try {
    ;[row] = await db
      .insert(projectConnectionAuditLog)
      .values(entry)
      .returning({ id: projectConnectionAuditLog.id })
  } catch (err) {
    throw new FrozenProjectRecoveryError(
      'audit_unavailable',
      'Could not record the recovery in the audit log',
      err,
    )
  }
  if (!row) {
    throw new FrozenProjectRecoveryError(
      'audit_unavailable',
      'Audit insert returned no row',
    )
  }
  return row.id
}

async function closeAuditEntry(
  auditId: number,
  outcome: 'success' | 'failure',
  failureReason: string | null,
): Promise<void> {
  await db
    .update(projectConnectionAuditLog)
    .set({ outcome, failure_reason: failureReason })
    .where(eq(projectConnectionAuditLog.id, auditId))
}

/**
 * Clear `is_frozen` on one project, in Redis and Postgres, with the actor,
 * project, and time recorded durably.
 *
 * Order:
 *   1. Read the stored record. Missing or not frozen returns without writing.
 *   2. Insert a `pending` audit row. If that fails, stop and change nothing.
 *   3. Compare-and-set the Redis value through `writeCourseMetadata`. The write
 *      applies only if Redis still holds the value read in step 1, and it
 *      stores the parsed record with only `is_frozen` changed. Unknown keys,
 *      absent `tags`, and existing `tags` are all kept as stored.
 *   4. Mark the audit row `success`, or `failure` if step 3 threw.
 *
 * Step 3 is not a cross-store transaction. See `writeCourseMetadataIfUnchanged`
 * for the failure boundaries.
 */
export async function recoverFrozenProject(args: {
  courseName: string
  actorEmail: string
  meta: AuditMeta
}): Promise<RecoveryOutcome> {
  const { courseName, actorEmail, meta } = args

  const raw = await readCourseMetadataRaw(courseName)
  if (raw === null) return { status: 'not_found' }

  const metadata = parseStoredMetadata(raw, courseName)
  if (metadata.is_frozen !== true) return { status: 'not_frozen' }

  const auditId = await openAuditEntry({
    actor_email: actorEmail,
    action: 'unfreeze',
    project_name: courseName,
    kind: null,
    outcome: 'pending',
    failure_reason: null,
    changed_fields: ['is_frozen'],
    ...meta,
  })

  try {
    await writeCourseMetadata(
      courseName,
      { ...metadata, is_frozen: false },
      { expectedPriorRedisValue: raw },
    )
  } catch (err) {
    const reason =
      err instanceof CourseMetadataWriteError ? err.stage : 'unexpected'
    try {
      await closeAuditEntry(auditId, 'failure', reason)
    } catch (auditErr) {
      console.error(
        '[frozenProjects] audit row could not be marked failed; it remains pending',
        { auditId, courseName },
        auditErr,
      )
    }
    throw err
  }

  try {
    await closeAuditEntry(auditId, 'success', null)
  } catch (err) {
    console.error(
      'CRITICAL: project was unfrozen but its audit row could not be marked success. Reconcile the audit log.',
      { auditId, courseName },
      err,
    )
    throw new FrozenProjectRecoveryError(
      'audit_not_finalized',
      `Unfroze ${courseName} but could not finalize its audit entry`,
      err,
    )
  }

  return { status: 'recovered', auditId }
}
