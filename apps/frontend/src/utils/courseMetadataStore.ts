// Atomic dual-write helper for chatbot metadata.
// Redis (`course_metadatas` hash) is the source of truth;
// Postgres (`course_metadata` table) is a search-optimized projection.
//
// Ordering: Postgres first (transactional), then Redis.
// If Redis fails, the Postgres row is rolled back to its prior state
// (or deleted on create). If Postgres fails, Redis is not touched.

import { eq, sql } from 'drizzle-orm'
import { db, courseMetadata as courseMetadataTable } from '~/db/dbClient'
import { ensureRedisConnected } from '~/utils/redisClient'
import { sanitizeChatbotTags } from '~/types/chatbotTags'
import type { CourseMetadata } from '~/types/courseMetadata'

export const REDIS_HASH = 'course_metadatas'

type CourseMetadataRow = typeof courseMetadataTable.$inferInsert

export interface WriteCourseMetadataOptions {
  /**
   * The raw Redis value the caller read before building `metadata`. When it is
   * provided, the Redis write is a compare-and-set: it applies only if the field
   * still holds exactly this value (null means the field must be absent).
   *
   * Opting in also changes two things for this call only:
   *   - The Redis value is `metadata` serialized as given. Tags are not
   *     normalized, so a read-modify-write caller changes only what it means to.
   *   - On conflict, Postgres is reconciled to whatever Redis holds now, not
   *     restored to the caller's snapshot.
   * Callers that omit this option keep the ordinary path below.
   */
  expectedPriorRedisValue?: string | null
}

/**
 * Compare-and-set on one hash field, run as a single Redis script so no other
 * client can write between the comparison and the HSET.
 *   KEYS[1] hash, ARGV[1] field, ARGV[2] '1' if the field must be absent,
 *   ARGV[3] expected value, ARGV[4] new value.
 * Returns 1 when applied, 0 when the stored value did not match.
 */
const COMPARE_AND_SET_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if ARGV[2] == '1' then
  if current ~= false then return 0 end
elseif current ~= ARGV[3] then
  return 0
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
return 1
`

export class CourseMetadataWriteError extends Error {
  public readonly stage: 'postgres' | 'redis' | 'rollback' | 'conflict'
  public readonly cause?: unknown
  constructor(
    stage: 'postgres' | 'redis' | 'rollback' | 'conflict',
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'CourseMetadataWriteError'
    this.stage = stage
    this.cause = cause
  }
}

function toRow(
  courseName: string,
  metadata: CourseMetadata,
): CourseMetadataRow {
  const sanitizedTags = metadata.tags ? sanitizeChatbotTags(metadata.tags) : []
  const normalized: CourseMetadata = { ...metadata, tags: sanitizedTags }

  return {
    course_name: courseName,
    course_owner: normalized.course_owner ?? '',
    course_admins: normalized.course_admins ?? [],
    approved_emails_list: normalized.approved_emails_list ?? [],
    project_description: normalized.project_description ?? null,
    tags: sanitizedTags,
    is_private: Boolean(normalized.is_private),
    allow_logged_in_users: Boolean(normalized.allow_logged_in_users),
    is_frozen: Boolean(normalized.is_frozen),
    raw_metadata: normalized,
    updated_at: new Date(),
  }
}

async function readPriorRedis(courseName: string): Promise<string | null> {
  const client = await ensureRedisConnected()
  const prior = await client.hGet(REDIS_HASH, courseName)
  return prior ?? null
}

/** Raw stored value for a project, or null. Pass it back as `expectedPriorRedisValue`. */
export async function readCourseMetadataRaw(
  courseName: string,
): Promise<string | null> {
  return readPriorRedis(courseName)
}

async function upsertPostgres(row: CourseMetadataRow): Promise<void> {
  await db
    .insert(courseMetadataTable)
    .values(row)
    .onConflictDoUpdate({
      target: courseMetadataTable.course_name,
      set: {
        course_owner: row.course_owner,
        course_admins: row.course_admins,
        approved_emails_list: row.approved_emails_list,
        project_description: row.project_description,
        tags: row.tags,
        is_private: row.is_private,
        allow_logged_in_users: row.allow_logged_in_users,
        is_frozen: row.is_frozen,
        raw_metadata: row.raw_metadata,
        updated_at: sql`now()`,
      },
    })
}

async function writeRedis(
  courseName: string,
  metadata: CourseMetadata,
): Promise<void> {
  const client = await ensureRedisConnected()
  await client.hSet(REDIS_HASH, {
    [courseName]: JSON.stringify(metadata),
  })
}

async function rollbackPostgres(
  courseName: string,
  priorRedisValue: string | null,
): Promise<void> {
  if (priorRedisValue === null) {
    // The row did not exist before this write — delete what we inserted.
    await db
      .delete(courseMetadataTable)
      .where(eq(courseMetadataTable.course_name, courseName))
    return
  }

  // The row existed before — restore it from the prior Redis value.
  try {
    const priorMetadata = JSON.parse(priorRedisValue) as CourseMetadata
    const priorRow = toRow(courseName, priorMetadata)
    await upsertPostgres(priorRow)
  } catch (parseErr) {
    throw new CourseMetadataWriteError(
      'rollback',
      `Could not parse prior Redis metadata to restore Postgres row for ${courseName}`,
      parseErr,
    )
  }
}

/**
 * Parse a stored Redis value. Returns null unless it is a JSON object, because
 * `JSON.parse` also yields null, arrays, and primitives, none of which has
 * metadata fields to read or preserve.
 */
export function parseStoredCourseMetadata(raw: string): CourseMetadata | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  return parsed as CourseMetadata
}

async function compareAndSetRedis(
  courseName: string,
  expected: string | null,
  nextValue: string,
): Promise<boolean> {
  const client = await ensureRedisConnected()
  const reply = await client.eval(COMPARE_AND_SET_SCRIPT, {
    keys: [REDIS_HASH],
    arguments: [
      courseName,
      expected === null ? '1' : '0',
      expected ?? '',
      nextValue,
    ],
  })
  return Number(reply) === 1
}

async function readCurrentRedis(courseName: string): Promise<string | null> {
  try {
    return await readPriorRedis(courseName)
  } catch (err) {
    throw new CourseMetadataWriteError(
      'rollback',
      `Could not read ${courseName} from Redis to reconcile Postgres`,
      err,
    )
  }
}

/** Make the Postgres projection match a Redis value. `null` means absent. */
async function reconcilePostgresTo(
  courseName: string,
  current: string | null,
): Promise<void> {
  try {
    if (current === null) {
      await db
        .delete(courseMetadataTable)
        .where(eq(courseMetadataTable.course_name, courseName))
      return
    }
    const record = parseStoredCourseMetadata(current)
    if (!record) {
      throw new Error('stored value is not a JSON object')
    }
    await upsertPostgres({ ...toRow(courseName, record), raw_metadata: record })
  } catch (err) {
    console.error(
      `CRITICAL: Postgres row for ${courseName} could not be reconciled to Redis. Manual reconciliation required.`,
      err,
    )
    throw new CourseMetadataWriteError(
      'rollback',
      `Could not reconcile Postgres for ${courseName} to Redis`,
      err,
    )
  }
}

/**
 * Compare-and-set variant of writeCourseMetadata, used only when the caller
 * passes `expectedPriorRedisValue`.
 *
 * Postgres is written first, as on the ordinary path, then Redis is written
 * only if it still holds the expected value. Failure boundaries:
 *   - Postgres fails: Redis is untouched; the error is `postgres`.
 *   - Redis reports no match: Postgres is reconciled to the current Redis
 *     value and the error is `conflict`.
 *   - Redis throws: the script may or may not have run. The current value is
 *     read back. If it is the new value, the write is treated as applied.
 *     Otherwise Postgres is reconciled and the error is `redis`.
 *   - Any step needed to reconcile fails: the error is `rollback`, and Postgres
 *     and Redis may disagree until someone reconciles them by hand.
 * There is no cross-store transaction, so a Postgres write can be briefly
 * visible before its Redis write is confirmed.
 */
async function writeCourseMetadataIfUnchanged(
  courseName: string,
  metadata: CourseMetadata,
  expected: string | null,
): Promise<void> {
  const nextValue = JSON.stringify(metadata)
  const row = { ...toRow(courseName, metadata), raw_metadata: metadata }

  try {
    await upsertPostgres(row)
  } catch (err) {
    throw new CourseMetadataWriteError(
      'postgres',
      `Failed to upsert course_metadata for ${courseName}`,
      err,
    )
  }

  let applied: boolean
  try {
    applied = await compareAndSetRedis(courseName, expected, nextValue)
  } catch (redisErr) {
    const current = await readCurrentRedis(courseName)
    if (current === nextValue) return
    await reconcilePostgresTo(courseName, current)
    if (current !== expected) {
      throw new CourseMetadataWriteError(
        'conflict',
        `Metadata for ${courseName} changed while the write was in flight; nothing was written`,
        redisErr,
      )
    }
    throw new CourseMetadataWriteError(
      'redis',
      `Redis write failed for ${courseName}; Postgres reconciled to Redis`,
      redisErr,
    )
  }
  if (applied) return

  await reconcilePostgresTo(courseName, await readCurrentRedis(courseName))
  throw new CourseMetadataWriteError(
    'conflict',
    `Metadata for ${courseName} changed since it was read; nothing was written`,
  )
}

/**
 * Atomically write chatbot metadata to Postgres and Redis.
 *
 * Order: Postgres upsert → Redis hSet. If Redis fails, the Postgres row is
 * rolled back (delete-on-create, update-to-prior on update).
 *
 * Throws CourseMetadataWriteError on any failure. Callers should surface 5xx.
 */
export async function writeCourseMetadata(
  courseName: string,
  metadata: CourseMetadata,
  options: WriteCourseMetadataOptions = {},
): Promise<void> {
  if (!courseName) {
    throw new CourseMetadataWriteError('postgres', 'courseName is required')
  }

  if (options.expectedPriorRedisValue !== undefined) {
    return writeCourseMetadataIfUnchanged(
      courseName,
      metadata,
      options.expectedPriorRedisValue,
    )
  }

  const priorRedisValue = await readPriorRedis(courseName)
  const row = toRow(courseName, metadata)

  try {
    await upsertPostgres(row)
  } catch (err) {
    throw new CourseMetadataWriteError(
      'postgres',
      `Failed to upsert course_metadata for ${courseName}`,
      err,
    )
  }

  try {
    await writeRedis(courseName, { ...metadata, tags: row.tags as never })
  } catch (redisErr) {
    try {
      await rollbackPostgres(courseName, priorRedisValue)
    } catch (rollbackErr) {
      console.error(
        `CRITICAL: Postgres row for ${courseName} could not be rolled back after Redis write failure. ` +
          `Manual reconciliation required.`,
        { redisErr, rollbackErr },
      )
      throw new CourseMetadataWriteError(
        'rollback',
        `Redis write failed and Postgres rollback also failed for ${courseName}`,
        rollbackErr,
      )
    }
    throw new CourseMetadataWriteError(
      'redis',
      `Redis write failed for ${courseName}; Postgres rolled back`,
      redisErr,
    )
  }
}

/**
 * Atomically delete chatbot metadata from Postgres and Redis.
 * Deletes Postgres first, then Redis. If Redis fails, the Postgres row is restored.
 */
export async function deleteCourseMetadata(courseName: string): Promise<void> {
  if (!courseName) {
    throw new CourseMetadataWriteError('postgres', 'courseName is required')
  }

  const priorRedisValue = await readPriorRedis(courseName)

  // Capture prior Postgres row for rollback.
  const [priorRow] = await db
    .select()
    .from(courseMetadataTable)
    .where(eq(courseMetadataTable.course_name, courseName))
    .limit(1)

  try {
    await db
      .delete(courseMetadataTable)
      .where(eq(courseMetadataTable.course_name, courseName))
  } catch (err) {
    throw new CourseMetadataWriteError(
      'postgres',
      `Failed to delete course_metadata for ${courseName}`,
      err,
    )
  }

  if (priorRedisValue === null) {
    return // nothing to delete in Redis
  }

  try {
    const client = await ensureRedisConnected()
    await client.hDel(REDIS_HASH, courseName)
  } catch (redisErr) {
    if (priorRow) {
      try {
        await db.insert(courseMetadataTable).values(priorRow)
      } catch (rollbackErr) {
        console.error(
          `CRITICAL: Could not restore Postgres row for ${courseName} after Redis delete failure.`,
          { redisErr, rollbackErr },
        )
        throw new CourseMetadataWriteError(
          'rollback',
          `Redis delete failed and Postgres restore also failed for ${courseName}`,
          rollbackErr,
        )
      }
    }
    throw new CourseMetadataWriteError(
      'redis',
      `Redis delete failed for ${courseName}; Postgres row restored`,
      redisErr,
    )
  }
}
