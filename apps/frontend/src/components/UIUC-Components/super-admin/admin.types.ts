// Shared shapes for the /admin console. No Redis, no server imports — this is
// pulled into the client bundle by every card in this folder.

import type { ConnectionKind } from '~/utils/projectConnections/validation'

export const ADMIN_TABS = ['platform', 'connections'] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export function isAdminTab(value: string): value is AdminTab {
  return (ADMIN_TABS as readonly string[]).includes(value)
}

/**
 * How long a connection change can take to reach a backend worker.
 *
 * `get_vector_db()` caches a `VectorDatabase` built from the config snapshot
 * for `_CONNECTION_TTL = 1800` seconds, and `_should_apply_course_filter()`
 * reads that snapshot rather than re-reading the row. There is no
 * cross-process invalidation, so this is a real bound the operator has to
 * know about — the UI must not imply a save is live everywhere.
 */
export const CONNECTION_PROPAGATION_NOTICE =
  'Saved immediately, but backend workers cache connection configs for up to 30 minutes. Changes to the course filter or credentials can take that long to take effect everywhere.'

export type ConnectionFieldType =
  | 'text'
  | 'secret'
  | 'number'
  | 'switch'
  | 'select'

export interface ConnectionFieldDescriptor {
  name: string
  label: string
  type: ConnectionFieldType
  /** Required by the kind's schema, so a brand-new config cannot omit it. */
  required: boolean
  placeholder?: string
  helpText?: string
  /** Options for `type: 'select'`. */
  options?: readonly string[]
  /**
   * What the backend assumes when a `switch` field is absent from the stored
   * config. `apply_course_filter` defaults to on, so a config saved without it
   * must not render as off.
   */
  switchDefault?: boolean
}

export interface ConnectionKindMeta {
  label: string
  description: string
  fields: readonly ConnectionFieldDescriptor[]
}

/**
 * Form definitions per kind, mirroring the zod schemas in
 * `utils/projectConnections/validation.ts`.
 *
 * Not exhaustive by design: `qdrant.collections` is a nested array the API
 * accepts but this form does not render. PATCH merges server-side against the
 * stored config, so an unrendered field survives an edit here untouched.
 */
export const CONNECTION_KIND_META: Record<ConnectionKind, ConnectionKindMeta> =
  {
    s3: {
      label: 'S3 storage',
      description:
        'Object storage for this project’s documents. Point at AWS S3 or any S3-compatible endpoint (MinIO, Ceph).',
      fields: [
        {
          name: 'aws_access_key_id',
          label: 'Access key ID',
          type: 'secret',
          required: true,
        },
        {
          name: 'aws_secret_access_key',
          label: 'Secret access key',
          type: 'secret',
          required: true,
        },
        {
          name: 'bucket_name',
          label: 'Bucket name',
          type: 'text',
          required: false,
        },
        {
          name: 'endpoint_url',
          label: 'Endpoint URL',
          type: 'text',
          required: false,
          placeholder: 'https://s3.example.edu',
          helpText: 'Leave blank for AWS S3.',
        },
        {
          name: 'region',
          label: 'Region',
          type: 'text',
          required: false,
          placeholder: 'us-east-1',
        },
      ],
    },
    database: {
      label: 'Postgres database',
      description:
        'Where this project’s documents, conversations, and metadata live.',
      fields: [
        {
          name: 'connection_uri',
          label: 'Connection URI',
          type: 'secret',
          required: true,
          placeholder: 'postgresql://user:password@host:6543/postgres',
          helpText:
            'Must be a postgres:// or postgresql:// URI. For Supabase, prefer the transaction pooler on port 6543.',
        },
      ],
    },
    qdrant: {
      label: 'Qdrant vector store',
      description: 'The vector collection this project searches for context.',
      fields: [
        {
          name: 'url',
          label: 'URL',
          type: 'text',
          required: true,
          placeholder: 'https://qdrant.example.edu',
        },
        { name: 'api_key', label: 'API key', type: 'secret', required: true },
        {
          name: 'port',
          label: 'Port',
          type: 'number',
          required: true,
          placeholder: '6333',
        },
        {
          name: 'default_collection',
          label: 'Default collection',
          type: 'text',
          required: true,
        },
        {
          name: 'apply_course_filter',
          label: 'Apply course filter',
          type: 'switch',
          required: false,
          switchDefault: true,
          helpText:
            'On: search is constrained to this project’s documents. Off: the whole collection is searched — only correct for a shared corpus. The backend treats an unset value as on.',
        },
        {
          name: 'parallel',
          label: 'Parallel search',
          type: 'switch',
          required: false,
          switchDefault: false,
          helpText: 'Query configured collections concurrently.',
        },
      ],
    },
    embedding: {
      label: 'Embedding provider',
      description:
        'Which model turns documents and queries into vectors. Must match the model the collection was built with.',
      fields: [
        {
          name: 'provider',
          label: 'Provider',
          type: 'select',
          required: true,
          options: ['openai', 'ollama'],
        },
        {
          name: 'model',
          label: 'Model',
          type: 'text',
          required: true,
          placeholder: 'text-embedding-3-small',
        },
        {
          name: 'base_url',
          label: 'Base URL',
          type: 'text',
          required: false,
          placeholder: 'https://ollama.example.edu',
          helpText: 'Required when the provider is Ollama.',
        },
        {
          name: 'api_base',
          label: 'API base',
          type: 'text',
          required: false,
          helpText: 'Override the OpenAI-compatible endpoint.',
        },
        { name: 'api_key', label: 'API key', type: 'secret', required: false },
        {
          name: 'query_instruction',
          label: 'Query instruction',
          type: 'text',
          required: false,
          helpText: 'Applied at query time for Qwen models only.',
        },
      ],
    },
  }

/**
 * Whether a value read back from the API is a mask rather than a real secret.
 *
 * `maskConfig` emits `****` plus at most the last 4 characters, so a value of
 * that exact shape must never be sent back as if it were the credential.
 */
export function isMaskedSecret(value: unknown): boolean {
  return typeof value === 'string' && /^\*{4}.{0,4}$/.test(value)
}
