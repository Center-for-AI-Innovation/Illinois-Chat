// Drizzle-backed CRUD for project_external_connections. The frontend is the
// sole writer; the backend reads via SQLAlchemy ORM. All operations run
// against `hostDb` — this table never participates in per-project routing.

import { eq, sql } from 'drizzle-orm'
import { db as hostDb } from '~/db/dbClient'
import {
  projectExternalConnections,
  projectConnectionAuditLog,
  projects,
  type ProjectExternalConnections,
  type NewProjectConnectionAuditLog,
} from '~/db/schema'
import type { ConnectionKind } from '~/utils/projectConnections/validation'

// Look up a project's primary-key id by its `course_name`. Returns null if
// the project does not exist — the route handler turns that into a 404.
export async function getProjectIdByName(
  projectName: string,
): Promise<number | null> {
  const rows = await hostDb
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.course_name, projectName))
    .limit(1)
  return rows[0]?.id ?? null
}

const KIND_TO_COLUMN: Record<ConnectionKind, string> = {
  s3: 's3_config',
  database: 'database_config',
  qdrant: 'qdrant_config',
  embedding: 'embedding_config',
}

export async function getConnectionByProject(
  projectName: string,
): Promise<ProjectExternalConnections | null> {
  const rows = await hostDb
    .select()
    .from(projectExternalConnections)
    .where(eq(projectExternalConnections.project_name, projectName))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertConnectionField(args: {
  projectName: string
  projectId: number
  kind: ConnectionKind
  encryptedBlob: { encrypted: string }
}): Promise<ProjectExternalConnections> {
  const { projectName, projectId, kind, encryptedBlob } = args
  const column = KIND_TO_COLUMN[kind]

  // Build the field-set we want for both INSERT and the UPDATE branch.
  const fieldUpdate: Record<string, unknown> = {
    [column]: encryptedBlob,
    is_active: true,
    updated_at: new Date(),
  }
  const insertValues = {
    project_id: projectId,
    project_name: projectName,
    s3_config: kind === 's3' ? encryptedBlob : null,
    database_config: kind === 'database' ? encryptedBlob : null,
    qdrant_config: kind === 'qdrant' ? encryptedBlob : null,
    embedding_config: kind === 'embedding' ? encryptedBlob : null,
    is_active: true,
  }

  const [row] = await hostDb
    .insert(projectExternalConnections)
    .values(insertValues)
    .onConflictDoUpdate({
      target: projectExternalConnections.project_name,
      set: fieldUpdate,
    })
    .returning()

  if (!row) {
    throw new Error('upsertConnectionField: no row returned from insert/update')
  }
  return row
}

export type PatchConnectionResult =
  | { status: 'ok'; row: ProjectExternalConnections }
  | { status: 'row_not_found' }
  | { status: 'kind_not_configured' }

/**
 * Rewrites one connection kind's encrypted blob without touching anything else
 * on the row.
 *
 * Two things this does that `upsertConnectionField` cannot:
 *
 * 1. It leaves `is_active` alone. `upsertConnectionField` hardcodes
 *    `is_active: true` in both its INSERT and its UPDATE branch, so reusing it
 *    for a partial edit would quietly re-enable a connection that an operator
 *    had deliberately disabled — a toggle flip turning traffic back on is not
 *    an acceptable side effect.
 *
 * 2. The read and the write happen in one transaction with the row locked
 *    (`SELECT … FOR UPDATE`). A read-then-write outside a transaction races a
 *    concurrent secret rotation: both sides read the same blob, both merge onto
 *    it, and the last writer silently discards the rotated key.
 *
 * The caller supplies `merge`, which receives the blob read *under the lock*
 * and returns its replacement. Decryption, validation, and re-encryption stay
 * with the caller so this module keeps to storage concerns — but because the
 * callback runs inside the transaction, it is always merging onto current data.
 *
 * Patching is strictly an edit: a missing row or an unconfigured kind is
 * reported rather than created, since there is no base config to merge onto.
 */
export async function patchConnectionField(args: {
  projectName: string
  kind: ConnectionKind
  merge: (current: { encrypted: string }) => Promise<{ encrypted: string }>
}): Promise<PatchConnectionResult> {
  const { projectName, kind, merge } = args
  const column = KIND_TO_COLUMN[kind]

  return hostDb.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(projectExternalConnections)
      .where(eq(projectExternalConnections.project_name, projectName))
      .limit(1)
      .for('update')

    const existing = locked[0]
    if (!existing) return { status: 'row_not_found' as const }

    const currentBlob = (existing as Record<string, unknown>)[column] as {
      encrypted: string
    } | null
    if (!currentBlob) return { status: 'kind_not_configured' as const }

    const nextBlob = await merge(currentBlob)

    const [row] = await tx
      .update(projectExternalConnections)
      .set({ [column]: nextBlob, updated_at: new Date() })
      .where(eq(projectExternalConnections.project_name, projectName))
      .returning()

    if (!row) {
      throw new Error('patchConnectionField: no row returned from update')
    }
    return { status: 'ok' as const, row }
  })
}

export interface ConnectionSummary {
  project_name: string
  is_active: boolean | null
  updated_at: Date | null
  created_at: Date | null
  configured_kinds: ConnectionKind[]
}

/**
 * Every project that has a connections row, with which kinds are configured.
 *
 * Returns no config contents — not even masked ones. This backs a list view
 * that only needs to know a config exists; the detail route is where a config
 * is actually read, so there is no reason for secrets to travel with the list.
 */
export async function listConnections(): Promise<ConnectionSummary[]> {
  const rows = await hostDb
    .select({
      project_name: projectExternalConnections.project_name,
      is_active: projectExternalConnections.is_active,
      updated_at: projectExternalConnections.updated_at,
      created_at: projectExternalConnections.created_at,
      has_s3: sql<boolean>`${projectExternalConnections.s3_config} IS NOT NULL`,
      has_database: sql<boolean>`${projectExternalConnections.database_config} IS NOT NULL`,
      has_qdrant: sql<boolean>`${projectExternalConnections.qdrant_config} IS NOT NULL`,
      has_embedding: sql<boolean>`${projectExternalConnections.embedding_config} IS NOT NULL`,
    })
    .from(projectExternalConnections)
    .orderBy(projectExternalConnections.project_name)

  return rows.map((row) => {
    const configured: ConnectionKind[] = []
    if (row.has_s3) configured.push('s3')
    if (row.has_database) configured.push('database')
    if (row.has_qdrant) configured.push('qdrant')
    if (row.has_embedding) configured.push('embedding')
    return {
      project_name: row.project_name,
      is_active: row.is_active,
      updated_at: row.updated_at,
      created_at: row.created_at,
      configured_kinds: configured,
    }
  })
}

export async function deleteConnection(args: {
  projectName: string
  kind?: ConnectionKind
}): Promise<{
  deleted: boolean
  found: boolean
  cleared: ConnectionKind | null
}> {
  const { projectName, kind } = args

  if (!kind) {
    const result = await hostDb
      .delete(projectExternalConnections)
      .where(eq(projectExternalConnections.project_name, projectName))
      .returning({ id: projectExternalConnections.id })
    const deleted = result.length > 0
    return { deleted, found: deleted, cleared: null }
  }

  const existing = await getConnectionByProject(projectName)
  if (!existing) return { deleted: false, found: false, cleared: null }

  const column = KIND_TO_COLUMN[kind]
  await hostDb
    .update(projectExternalConnections)
    .set({ [column]: null, updated_at: new Date() })
    .where(eq(projectExternalConnections.project_name, projectName))

  return { deleted: true, found: true, cleared: kind }
}

export async function setActive(args: {
  projectName: string
  isActive: boolean
}): Promise<{ found: boolean; is_active: boolean | null }> {
  const { projectName, isActive } = args
  const result = await hostDb
    .update(projectExternalConnections)
    .set({ is_active: isActive, updated_at: new Date() })
    .where(eq(projectExternalConnections.project_name, projectName))
    .returning({ is_active: projectExternalConnections.is_active })
  const row = result[0]
  if (!row) return { found: false, is_active: null }
  return { found: true, is_active: row.is_active }
}

export async function writeAuditEntry(
  entry: Omit<NewProjectConnectionAuditLog, 'id' | 'created_at'>,
): Promise<void> {
  try {
    await hostDb.insert(projectConnectionAuditLog).values(entry)
  } catch (e) {
    // Audit failures should never break the user-visible response, but they
    // are important to surface. Log and move on.
    console.error('[projectConnections] audit-log write failed:', e, {
      action: entry.action,
      project_name: entry.project_name,
    })
  }
}

// Re-export sql for callers that need raw fragments (kept here so they don't
// have to depend on drizzle-orm directly).
export { sql }
