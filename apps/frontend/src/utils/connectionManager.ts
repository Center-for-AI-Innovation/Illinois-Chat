// Server-only resolver for S3 / Qdrant / documents-Postgres / embedding
// clients, per project, falling back to the shared defaults when no override
// exists.
//
// Mirrors the backend's ConnectionManager (ai_ta_backend/database/connection_manager.py):
//   - every call reads `project_external_connections` from the host db and
//     decrypts it; nothing is cached anywhere
//   - host-only data (conversations, projects, stats, ...) always uses the
//     host db; only document-related tables route through getDocumentsDb().
//
// Why no cache (issue #228): a cached config or client is only correct until
// someone edits the project's connection. The old design cached configs for
// 5 min (in-process + Redis) and live clients for 30 min, and only the replica
// that served the write invalidated them, so every other frontend replica, the
// backend, and the ingest worker served stale credentials for up to 30 min.
// Resolving per request removes the staleness window entirely and keeps
// decrypted credentials out of Redis. Connection cost is delegated to the
// external database's own pooler (the documented setup is a Supabase
// transaction pooler).
//
// Lifecycle notes:
//   - the postgres.js client is never explicitly ended; `idle_timeout` closes
//     its connection and clears its timers, after which the unreferenced
//     client is garbage collected.
//   - S3Client is not destroy()ed; its keep-alive sockets close on the HTTP
//     agent's own timeout.
//
// This module imports node-only deps and must never be evaluated in the browser.

import { S3Client } from '@aws-sdk/client-s3'
import { QdrantClient } from '@qdrant/js-client-rest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '~/db/schema'
import { db as hostDb } from '~/db/dbClient'
import { s3Client as defaultS3Client } from '~/utils/s3Client'
import { decryptProjectConfig, type EncryptedField } from '~/utils/crypto'
import type { EmbeddingOverrideConfig } from '~/utils/projectConnections/validation'

import OpenAI from 'openai'

// ---------------------------------------------------------------------------
// Types — kept local so this module doesn't conflict with the milestone-2
// UI-side `src/types/externalConnections.ts` that's currently in flight.
// ---------------------------------------------------------------------------

export interface S3OverrideConfig {
  aws_access_key_id: string
  aws_secret_access_key: string
  bucket_name?: string
  endpoint_url?: string
  region?: string
}

export interface DatabaseOverrideConfig {
  connection_uri: string
}

export interface QdrantOverrideConfig {
  // URL is the source of truth for both host and scheme. Both qdrant-client
  // libraries (Python qdrant_remote.py:97-99 and JS qdrant-client.js:29)
  // let the URL's scheme overwrite any `https` flag passed alongside it, so
  // we don't model `https` here. The Python backend's connection_manager.py
  // still does `.get("https", False)` which is now a no-op against records
  // written by the new shape.
  url: string
  api_key: string
  // Applied only when the URL has no explicit port — matches qdrant-client
  // semantics (`self._port = parsed_url.port or port` in both libs).
  port?: number
  // Primary collection. All ingest writes (and the doc_groups setPayload
  // mutation that shares that lane) target this collection. The optional
  // `collections` array on the backend's qdrant_config schema is read-side
  // fan-out only and is intentionally not modeled here — the frontend never
  // dispatches reads to Qdrant directly.
  default_collection?: string
}

interface ResolvedRow {
  s3: S3OverrideConfig | null
  database: DatabaseOverrideConfig | null
  qdrant: QdrantOverrideConfig | null
  embedding: EmbeddingOverrideConfig | null
}

// Discriminated union returned by `getEmbeddingClient`. Mirrors the backend's
// `_resolve_embedding_client` (ai_ta_backend/service/retrieval_service.py).
// The Ollama branch deliberately does NOT use the OpenAI SDK against Ollama's
// `/v1` compat endpoint — see backend `OllamaEmbeddings`. Both code paths
// (frontend Drizzle + backend `/getTopContexts`) hit `${baseUrl}/api/embeddings`
// with the same `{model, prompt}` payload so vectors land in the same space.
export type ResolvedEmbeddingClient =
  | {
      kind: 'openai'
      client: OpenAI
      model: string
      applyQwenInstruction: boolean
      queryInstruction: string
    }
  | { kind: 'ollama'; baseUrl: string; model: string }

export interface ResolvedS3 {
  client: S3Client
  bucket: string | null
  endpoint: string | null
  region: string | null
  // False when this is the shared default client (no per-project s3_config).
  isOverride: boolean
}

export type ResolvedVectorEngine =
  | { kind: 'qdrant'; client: QdrantClient; collection: string }
  | { kind: 'pgvector' }

// Returned when a project has no row, or its row is inactive.
const NO_OVERRIDES: ResolvedRow = {
  s3: null,
  database: null,
  qdrant: null,
  embedding: null,
}

const DEFAULT_QWEN_QUERY_INSTRUCTION =
  'Given a user search query, retrieve the most relevant passages from the Illinois Chat knowledge base stored in the vector store to answer the query accurately. Prioritize authoritative course materials, syllabi, FAQs, official documentation, web pages, and other relevant sources. Ignore boilerplate/navigation text.'

type DocumentsDb = typeof hostDb

class ConnectionManager {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async getS3Client(projectName: string): Promise<ResolvedS3> {
    const config = await this.resolveConfig(projectName)
    return buildS3(config.s3)
  }

  /**
   * Resolve which vector engine a project should use.
   *
   * Order of resolution:
   *   1. Project has an active non-null `qdrant_config`     → external Qdrant
   *   2. Otherwise                                          → pgvector
   *      (host pgvector by default; per-project external pg when
   *      `database_config` is set — embeddings follow the documents db.)
   */
  async resolveVectorEngine(
    projectName: string,
  ): Promise<ResolvedVectorEngine> {
    const config = await this.resolveConfig(projectName)
    if (config.qdrant) {
      const { client, collection } = buildQdrant(config.qdrant)
      return { kind: 'qdrant', client, collection }
    }
    return { kind: 'pgvector' }
  }

  async getDocumentsDb(projectName: string): Promise<DocumentsDb> {
    const config = await this.resolveConfig(projectName)
    if (!config.database) return hostDb

    const sql = postgres(config.database.connection_uri, {
      // One connection per request. Clients are no longer shared between
      // requests, so external sessions scale with in-flight requests; keeping
      // this at 1 bounds that. Every caller issues sequential queries (the
      // vector search wraps them in a single transaction), so nothing needs a
      // second connection.
      max: 1,
      // Seconds. Short so the pooler session is released promptly once the
      // request is done; postgres.js reconnects transparently if a request
      // pauses longer than this between queries.
      idle_timeout: 5,
      connect_timeout: 10,
      // Named prepared statements break Supavisor/PgBouncer transaction
      // mode (statements don't survive backend rotation).
      prepare: false,
    })
    return drizzle(sql, { schema })
  }

  /**
   * Resolve the embedding client for a project. Mirrors the backend's
   * `_resolve_embedding_client` (retrieval_service.py): reads the top-level
   * `embedding_config` column, falls back to env defaults when unset.
   *
   * The returned value is a discriminated union so callers (e.g. `embedQuery`)
   * can dispatch to the right HTTP shape — `openai` via the OpenAI SDK,
   * `ollama` via a raw `fetch` to `/api/embeddings` (NOT Ollama's `/v1`
   * OpenAI-compat endpoint — backend uses LangChain `OllamaEmbeddings` which
   * targets `/api/embeddings`; we mirror it for vector-space parity).
   */
  async getEmbeddingClient(
    projectName: string,
  ): Promise<ResolvedEmbeddingClient> {
    const config = await this.resolveConfig(projectName)
    return buildEmbedding(config.embedding)
  }

  // -------------------------------------------------------------------------
  // Resolution — config layer
  // -------------------------------------------------------------------------

  private async resolveConfig(projectName: string): Promise<ResolvedRow> {
    // project_external_connections always lives on the host DB; never resolve
    // through getDocumentsDb here.
    const rows = await hostDb
      .select()
      .from(schema.projectExternalConnections)
      .where(eq(schema.projectExternalConnections.project_name, projectName))
      .limit(1)

    if (!rows.length || rows[0]!.is_active === false) return NO_OVERRIDES

    const row = rows[0]!
    const [s3, database, qdrant, embedding] = await Promise.all([
      decryptProjectConfig<S3OverrideConfig>(row.s3_config as EncryptedField),
      decryptProjectConfig<DatabaseOverrideConfig>(
        row.database_config as EncryptedField,
      ),
      decryptProjectConfig<QdrantOverrideConfig>(
        row.qdrant_config as EncryptedField,
      ),
      decryptProjectConfig<EmbeddingOverrideConfig>(
        row.embedding_config as EncryptedField,
      ),
    ])
    // Legacy: older rows stored the embedding override under
    // `qdrant_config.embedding`. Honor it as a fallback so we don't break
    // existing Qdrant projects until they migrate to the new column.
    const legacyEmbedding =
      !embedding && qdrant && typeof qdrant === 'object'
        ? ((qdrant as unknown as { embedding?: EmbeddingOverrideConfig })
            .embedding ?? null)
        : null

    return { s3, database, qdrant, embedding: embedding ?? legacyEmbedding }
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildS3(s3: S3OverrideConfig | null): ResolvedS3 {
  if (!s3) {
    if (!defaultS3Client) {
      throw new Error(
        'No project S3 override and the default S3 client is not configured (missing AWS_REGION / AWS_KEY / AWS_SECRET).',
      )
    }
    return {
      client: defaultS3Client,
      bucket: process.env.S3_BUCKET_NAME ?? null,
      endpoint: process.env.MINIO_ENDPOINT ?? null,
      region: process.env.AWS_REGION ?? null,
      isOverride: false,
    }
  }

  const region = s3.region ?? 'us-east-1' // AWS SDK JS v3 requires an explicit region
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: s3.aws_access_key_id,
      secretAccessKey: s3.aws_secret_access_key,
    },
    ...(s3.endpoint_url
      ? { endpoint: s3.endpoint_url, forcePathStyle: true }
      : {}),
  })

  return {
    client,
    bucket: s3.bucket_name ?? process.env.S3_BUCKET_NAME ?? null,
    endpoint: s3.endpoint_url ?? null,
    region,
    isOverride: true,
  }
}

function buildQdrant(q: QdrantOverrideConfig): {
  client: QdrantClient
  collection: string
} {
  const collection =
    q.default_collection ?? process.env.QDRANT_COLLECTION_NAME ?? null
  if (!collection) {
    throw new Error(
      `Project Qdrant override has no default_collection and QDRANT_COLLECTION_NAME is not set.`,
    )
  }

  const client = new QdrantClient({
    url: buildQdrantUrl(q),
    apiKey: q.api_key,
  })

  return { client, collection }
}

function buildEmbedding(
  cfg: EmbeddingOverrideConfig | null,
): ResolvedEmbeddingClient {
  const envModel = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'
  const envApiKey =
    process.env.OPENAI_API_KEY || process.env.NCSA_HOSTED_API_KEY || ''
  const envApiBase =
    process.env.EMBEDDING_API_BASE || 'https://api.openai.com/v1'
  const queryInstruction =
    process.env.QWEN_QUERY_INSTRUCTION || DEFAULT_QWEN_QUERY_INSTRUCTION

  if (!cfg) {
    // Env-only default — preserves the legacy behaviour of `embedQuery.ts`.
    return {
      kind: 'openai',
      client: new OpenAI({ apiKey: envApiKey, baseURL: envApiBase }),
      model: envModel,
      applyQwenInstruction: envModel.toLowerCase().includes('qwen'),
      queryInstruction,
    }
  }

  const model = cfg.model || envModel
  const cfgInstruction = cfg.query_instruction || queryInstruction

  if (cfg.provider === 'ollama') {
    const baseUrl =
      cfg.base_url ||
      process.env.OLLAMA_BASE_URL ||
      process.env.OLLAMA_SERVER_URL
    if (!baseUrl) {
      // Same message-shape as backend `retrieval_service.py:_resolve_embedding_client`
      // so substring-matching dev tooling works against either runtime.
      throw new Error(
        "embedding_config provider='ollama' requires base_url (or set OLLAMA_BASE_URL / OLLAMA_SERVER_URL)",
      )
    }
    return { kind: 'ollama', baseUrl, model }
  }

  // Default to OpenAI-compatible for anything else. The provider value has
  // already been narrowed by Zod (validation.ts) at the API boundary and by
  // ALLOWED_EMBEDDING_PROVIDERS on the backend resolver.
  const apiKey = cfg.api_key || envApiKey
  const baseURL = cfg.api_base || envApiBase
  return {
    kind: 'openai',
    client: new OpenAI({ apiKey, baseURL }),
    model,
    applyQwenInstruction: model.toLowerCase().includes('qwen'),
    queryInstruction: cfgInstruction,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Exported because the test probe in ~/utils/projectConnections/tester needs
// the same effective URL as the runtime QdrantClient.
//
// The URL's scheme is authoritative — this matches both qdrant-client libs
// (Python qdrant_remote.py:97-99 and JS qdrant-client.js:29 both let the
// URL's scheme overwrite the `https` arg). We only graft the configured port
// when the URL doesn't already carry one, which mirrors the same libs'
// `self._port = parsed_url.port or port`.
export function buildQdrantUrl(q: QdrantOverrideConfig): string {
  if (!q.port) return q.url
  try {
    const u = new URL(q.url)
    if (!u.port) u.port = String(q.port)
    return u.toString().replace(/\/$/, '')
  } catch {
    return q.url
  }
}

// The manager holds no state, so a plain module-scope instance is enough —
// each API route bundle getting its own copy costs nothing.
export const connectionManager = new ConnectionManager()
