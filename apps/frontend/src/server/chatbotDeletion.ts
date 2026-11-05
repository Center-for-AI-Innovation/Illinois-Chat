// Chatbot deletion: the fast, blocking half.
//
// Deleting a chatbot with thousands of documents can take a long time, so the
// request only does what must be instant:
//   1. record a `project_deletions` row (reserves the name),
//   2. remove the chatbot's metadata so it disappears from every page and
//      access check right away,
//   3. ask the backend to queue the background purge.
// The worker's delete consumer (apps/backend/ai_ta_backend/rabbitmq/purge.py)
// then removes vectors, documents, conversations and S3 objects in batches.

import { and, desc, eq, ne } from 'drizzle-orm'
import {
  db,
  projectDeletions,
  projectExternalConnections,
  projects,
} from '~/db/dbClient'
import type { ExternalStoreKind } from '~/types/chatbotDeletion'
import type { CourseMetadata } from '~/types/courseMetadata'
import { getBackendUrl } from '~/utils/apiUtils'
import { deleteCourseMetadata } from '~/utils/courseMetadataStore'
import { ensureRedisConnected } from '~/utils/redisClient'

export type ChatbotDeletion = typeof projectDeletions.$inferSelect

export class ChatbotDeletionConflictError extends Error {
  constructor(courseName: string) {
    super(`Chatbot '${courseName}' is already being deleted`)
    this.name = 'ChatbotDeletionConflictError'
  }
}

/** Latest deletion for this name, active or not. */
export async function getLatestDeletion(
  courseName: string,
): Promise<ChatbotDeletion | null> {
  const [row] = await db
    .select()
    .from(projectDeletions)
    .where(eq(projectDeletions.project_name, courseName))
    .orderBy(desc(projectDeletions.id))
    .limit(1)
  return row ?? null
}

/** True while a deletion is pending, running or failed: the name is reserved. */
export async function isChatbotDeleting(courseName: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projectDeletions.id })
    .from(projectDeletions)
    .where(
      and(
        eq(projectDeletions.project_name, courseName),
        ne(projectDeletions.status, 'completed'),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Which of the chatbot's own stores (project_external_connections) are
 * configured. Kinds only, never config values: owners see this in the delete
 * dialog even though the connections themselves are super-admin managed.
 */
export async function getExternalStores(
  courseName: string,
): Promise<ExternalStoreKind[]> {
  const [row] = await db
    .select({
      database: projectExternalConnections.database_config,
      qdrant: projectExternalConnections.qdrant_config,
      s3: projectExternalConnections.s3_config,
    })
    .from(projectExternalConnections)
    .where(
      and(
        eq(projectExternalConnections.project_name, courseName),
        eq(projectExternalConnections.is_active, true),
      ),
    )
    .limit(1)
  if (!row) return []
  return (['database', 'qdrant', 's3'] as const).filter((kind) => row[kind])
}

/** Ask the backend to publish the purge job. Safe to call more than once. */
export async function enqueueChatbotDeletion(
  deletionId: number,
): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/deleteProject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deletion_id: deletionId }),
  })
  if (!response.ok) {
    throw new Error(`Backend refused to queue deletion (${response.status})`)
  }
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code
  return code === '23505'
}

export interface StartDeletionResult {
  deletion: ChatbotDeletion
  /** False when the backend could not queue the purge; a super admin can retry. */
  queued: boolean
}

export async function startChatbotDeletion({
  courseName,
  metadata,
  requestedBy,
  includeExternal,
}: {
  courseName: string
  metadata: CourseMetadata
  requestedBy: string
  includeExternal: boolean
}): Promise<StartDeletionResult> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.course_name, courseName))
    .limit(1)

  let deletion: ChatbotDeletion
  try {
    const [inserted] = await db
      .insert(projectDeletions)
      .values({
        project_name: courseName,
        project_id: project?.id ?? null,
        requested_by: requestedBy,
        include_external: includeExternal,
        metadata_backup: metadata,
      })
      .returning()
    deletion = inserted!
  } catch (err) {
    // project_deletions_active_name_idx: one active deletion per name.
    if (isUniqueViolation(err))
      throw new ChatbotDeletionConflictError(courseName)
    throw err
  }

  // Hide the chatbot. If this fails nothing else has changed yet, so drop the
  // row and let the caller report the error.
  try {
    await deleteCourseMetadata(courseName)
    const redis = await ensureRedisConnected()
    await redis.del(`${courseName}-llms`)
  } catch (err) {
    await db
      .delete(projectDeletions)
      .where(eq(projectDeletions.id, deletion.id))
    throw err
  }

  try {
    await enqueueChatbotDeletion(deletion.id)
    return { deletion, queued: true }
  } catch (err) {
    // The chatbot is already hidden, so do not undo anything. Leave the row
    // as 'failed' with a reason; the retry endpoint (or a worker restart's
    // resume sweep, for 'pending' rows) picks it up.
    console.error(`Could not queue deletion ${deletion.id}:`, err)
    const [failed] = await db
      .update(projectDeletions)
      .set({
        status: 'failed',
        error: `Could not queue the purge job: ${(err as Error).message}`,
      })
      .where(eq(projectDeletions.id, deletion.id))
      .returning()
    return { deletion: failed ?? deletion, queued: false }
  }
}
