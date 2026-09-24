// Full CRUD for project_external_connections. The frontend is the sole
// writer; the backend's ConnectionManager reads the same rows for runtime
// dispatch. Authorization is super-admin-only via withSuperAdminOnly (the
// guard runs inside the handler — not Next middleware, see CVE-2025-29927).

import type { NextApiResponse } from 'next'
import type { AuthenticatedRequest } from '~/utils/authMiddleware'
import { withSuperAdminOnly } from '~/utils/superAdminGuard'
import {
  decryptProjectConfig,
  encryptProjectConfig,
  maskConfig,
  type EncryptedField,
} from '~/utils/crypto'
import {
  getProjectIdByName,
  getConnectionByProject,
  upsertConnectionField,
  patchConnectionField,
  deleteConnection,
  writeAuditEntry,
} from '~/db/projectConnectionsRepo'
import {
  upsertBodySchema,
  patchBodySchema,
  configSchemaByKind,
  deleteQuerySchema,
  getQuerySchema,
  CONNECTION_KINDS,
  supabasePoolerWarning,
  type ConnectionKind,
} from '~/utils/projectConnections/validation'
import {
  extractRequestMeta,
  formatZodError,
} from '~/utils/projectConnections/handlerShared'

// Exported for unit tests — the route default export wraps this in
// withSuperAdminOnly. Tests can invoke `handler` directly with a pre-set
// req.user to bypass the JWT/role layer.
export async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const meta = extractRequestMeta(req)
  const actorEmail = req.user?.email ?? 'unknown'

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res)
      case 'POST':
        return await handlePost(req, res, actorEmail, meta)
      case 'PATCH':
        return await handlePatch(req, res, actorEmail, meta)
      case 'DELETE':
        return await handleDelete(req, res, actorEmail, meta)
      default:
        res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (err) {
    console.error('[projectConnections] handler error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// GET — return decrypted + masked configs
// ---------------------------------------------------------------------------

async function handleGet(req: AuthenticatedRequest, res: NextApiResponse) {
  const parsed = getQuerySchema.safeParse({
    project_name:
      (req.query.project_name as string | undefined) ??
      (req.query.course_name as string | undefined),
  })
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const { project_name } = parsed.data

  const row = await getConnectionByProject(project_name)
  if (!row) {
    return res.status(200).json({ found: false, project_name })
  }

  const [s3, database, qdrant, embedding] = await Promise.all([
    decryptProjectConfig<Record<string, unknown>>(
      row.s3_config as EncryptedField,
    ),
    decryptProjectConfig<Record<string, unknown>>(
      row.database_config as EncryptedField,
    ),
    decryptProjectConfig<Record<string, unknown>>(
      row.qdrant_config as EncryptedField,
    ),
    decryptProjectConfig<Record<string, unknown>>(
      row.embedding_config as EncryptedField,
    ),
  ])

  return res.status(200).json({
    found: true,
    project_name: row.project_name,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    s3_config: maskConfig(s3),
    database_config: maskConfig(database),
    qdrant_config: maskConfig(qdrant),
    embedding_config: maskConfig(embedding),
  })
}

// ---------------------------------------------------------------------------
// POST — upsert one connection kind
// ---------------------------------------------------------------------------

async function handlePost(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  actorEmail: string,
  meta: ReturnType<typeof extractRequestMeta>,
) {
  const parsed = upsertBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const body = parsed.data
  const projectName = body.project_name
  const kind: ConnectionKind = body.kind

  const projectId = await getProjectIdByName(projectName)
  if (projectId == null) {
    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'upsert',
      project_name: projectName,
      kind,
      outcome: 'failure',
      failure_reason: 'project_not_found',
      changed_fields: null,
      ...meta,
    })
    return res.status(404).json({
      error: `Project '${projectName}' not found. Create it first.`,
    })
  }

  try {
    const encryptedBlob = await encryptProjectConfig(body.config)
    await upsertConnectionField({
      projectName,
      projectId,
      kind,
      encryptedBlob,
    })

    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'upsert',
      project_name: projectName,
      kind,
      outcome: 'success',
      failure_reason: null,
      // Field NAMES only — never the values.
      changed_fields: Object.keys(body.config as Record<string, unknown>),
      ...meta,
    })

    // Non-blocking advisory (warn-don't-reject policy): flag Supabase URIs
    // that aren't the transaction pooler so operators can fix them early.
    const warning =
      kind === 'database'
        ? supabasePoolerWarning(
            (body.config as { connection_uri: string }).connection_uri,
          )
        : null

    return res.status(200).json({
      success: true,
      project_name: projectName,
      project_id: projectId,
      kind,
      ...(warning ? { warning } : {}),
    })
  } catch (e) {
    console.error('[projectConnections] upsert failed:', e)
    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'upsert',
      project_name: projectName,
      kind,
      outcome: 'failure',
      failure_reason: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
      changed_fields: null,
      ...meta,
    })
    return res.status(500).json({ error: 'Failed to upsert connection' })
  }
}

// ---------------------------------------------------------------------------
// PATCH — change some fields of an existing connection kind
// ---------------------------------------------------------------------------

async function handlePatch(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  actorEmail: string,
  meta: ReturnType<typeof extractRequestMeta>,
) {
  const parsed = patchBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  const body = parsed.data
  const projectName = body.project_name
  const kind: ConnectionKind = body.kind
  const patch = body.config as Record<string, unknown>

  if (Object.keys(patch).length === 0) {
    return res
      .status(400)
      .json({ error: 'config must contain at least one field to update' })
  }

  // Tracks whether the merged result failed validation, so the catch below can
  // tell a bad request apart from a genuine server fault. `merge` runs inside
  // the transaction and a throw there rolls the whole thing back, which is what
  // we want — but the error surfaces here rather than at the parse site.
  let validationError: ReturnType<typeof formatZodError> | null = null
  let mergedFieldNames: string[] = []

  try {
    const result = await patchConnectionField({
      projectName,
      kind,
      merge: async (current) => {
        const stored =
          (await decryptProjectConfig<Record<string, unknown>>(current)) ?? {}
        // Patch on top of the stored config, so fields the UI never received
        // in plaintext (secrets arrive masked) keep their real values.
        const merged = { ...stored, ...patch }

        // Validated against the *full* schema, not the partial one: the point
        // of the merge is that the result must be a complete, valid config.
        const validated = configSchemaByKind[kind].safeParse(merged)
        if (!validated.success) {
          validationError = formatZodError(validated.error)
          throw new Error('merged config failed validation')
        }
        mergedFieldNames = Object.keys(patch)
        return encryptProjectConfig(validated.data)
      },
    })

    if (result.status === 'row_not_found') {
      return res.status(404).json({
        error: `Project '${projectName}' has no external connections configured.`,
      })
    }
    if (result.status === 'kind_not_configured') {
      return res.status(404).json({
        error: `Project '${projectName}' has no '${kind}' connection to patch. Create it with POST first.`,
      })
    }

    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'upsert',
      project_name: projectName,
      kind,
      outcome: 'success',
      failure_reason: null,
      // Field NAMES only — never the values.
      changed_fields: mergedFieldNames,
      ...meta,
    })

    const warning =
      kind === 'database' && typeof patch.connection_uri === 'string'
        ? supabasePoolerWarning(patch.connection_uri)
        : null

    return res.status(200).json({
      success: true,
      project_name: projectName,
      kind,
      // Echoed so a caller can see the patch did not flip activation. This
      // route never writes is_active; use the /active route for that.
      is_active: result.row.is_active,
      ...(warning ? { warning } : {}),
    })
  } catch (e) {
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }
    console.error('[projectConnections] patch failed:', e)
    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'upsert',
      project_name: projectName,
      kind,
      outcome: 'failure',
      failure_reason: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
      changed_fields: null,
      ...meta,
    })
    return res.status(500).json({ error: 'Failed to patch connection' })
  }
}

// ---------------------------------------------------------------------------
// DELETE — drop a row or NULL one column
// ---------------------------------------------------------------------------

async function handleDelete(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  actorEmail: string,
  meta: ReturnType<typeof extractRequestMeta>,
) {
  const rawKind = req.query.kind ?? req.query.type
  const parsed = deleteQuerySchema.safeParse({
    project_name:
      (req.query.project_name as string | undefined) ??
      (req.query.course_name as string | undefined),
    kind: typeof rawKind === 'string' ? rawKind : undefined,
  })
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) })
  }
  if (
    parsed.data.kind !== undefined &&
    !CONNECTION_KINDS.includes(parsed.data.kind)
  ) {
    return res.status(400).json({
      error: `kind must be one of: ${CONNECTION_KINDS.join(', ')}`,
    })
  }
  const { project_name, kind } = parsed.data

  try {
    const result = await deleteConnection({ projectName: project_name, kind })

    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'delete',
      project_name,
      kind: kind ?? null,
      outcome: 'success',
      failure_reason: null,
      changed_fields: null,
      ...meta,
    })

    return res.status(200).json({
      success: true,
      project_name,
      deleted: result.deleted,
      found: result.found,
      cleared: result.cleared,
    })
  } catch (e) {
    console.error('[projectConnections] delete failed:', e)
    await writeAuditEntry({
      actor_email: actorEmail,
      action: 'delete',
      project_name,
      kind: kind ?? null,
      outcome: 'failure',
      failure_reason: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
      changed_fields: null,
      ...meta,
    })
    return res.status(500).json({ error: 'Failed to delete connection' })
  }
}

export default withSuperAdminOnly(handler)
