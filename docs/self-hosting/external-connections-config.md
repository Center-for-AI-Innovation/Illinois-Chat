# External connections config reference

This page documents the exact JSON config format for each external connection type. All configs are encrypted at rest and stored as JSONB in the `project_external_connections` table.

!!! info "Who writes these rows"
    The Next.js frontend (`apps/frontend/src/pages/api/UIUC-api/projectConnections*`) is the sole writer. The Python backend reads the rows at runtime for per-project dispatch. The Zod validation schemas in `apps/frontend/src/utils/projectConnections/validation.ts` are the source of truth for required fields and accepted shapes; the descriptions on this page must stay aligned with those schemas.

For what external connections are and when to use them, see [External connections](../building/external-connections.md). For the operator walkthrough (provisioning an external Postgres, registering connections with the CLI, how routing behaves once a connection is active), see [External connections (operators)](external-connections.md). The backend environment variables involved (`ENCRYPTION_MASTER_KEY`, `QDRANT_COLLECTION_NAME`, `S3_BUCKET_NAME`) are listed in the [Configuration reference](configuration.md).

## Bucket storage config (S3 / MinIO)

The `s3_config` block supports either AWS S3 or any S3-compatible storage such as MinIO. The presence of `endpoint_url` toggles between the two: omit it for AWS S3, set it for MinIO or other S3-compatible services.

### AWS S3

```json
{
  "aws_access_key_id": "AKIAIOSFODNN7EXAMPLE",
  "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "bucket_name": "my-project-bucket",
  "region": "us-east-1"
}
```

### MinIO (or other S3-compatible storage)

```json
{
  "aws_access_key_id": "AKIAIOSFODNN7EXAMPLE",
  "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "bucket_name": "my-project-bucket",
  "endpoint_url": "https://minio.example.com"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `aws_access_key_id` | string | **Yes** | Access key ID (works for both AWS S3 and MinIO) |
| `aws_secret_access_key` | string | **Yes** | Secret access key (works for both AWS S3 and MinIO) |
| `bucket_name` | string | No | Bucket name. Falls back to the `S3_BUCKET_NAME` environment variable if omitted. |
| `endpoint_url` | string | No | Custom S3-compatible endpoint URL. **Provide this for MinIO**; omit for AWS S3. |
| `region` | string | No | AWS region for the bucket (e.g. `us-east-1`). Required by clients that don't have an automatic region-resolution chain (notably the AWS SDK for JavaScript v3). When omitted, the Flask backend falls back to boto3's resolution chain (`AWS_DEFAULT_REGION`, instance metadata, etc.). |

!!! info "MinIO users"
    Set `endpoint_url` to your MinIO server address (e.g. `https://minio.example.com`). Path-style addressing is automatically enabled when `endpoint_url` is provided. `region` is generally not needed for MinIO but is accepted if your deployment requires it.

!!! info "Frontend access"
    When the Next.js frontend resolves S3 connections directly (using AWS SDK JS v3, which has no region-resolution chain), `region` must be present in the stored config. The frontend defaults to `us-east-1` when absent, so existing rows without `region` keep working, but set it explicitly for any non-`us-east-1` bucket.

## Database config

```json
{
  "connection_uri": "postgresql://user:password@db.example.com:5432/project_db"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `connection_uri` | string | **Yes** | Full PostgreSQL connection URI (`postgres://` or `postgresql://` only). The engine is created per request with `poolclass=NullPool`; connection reuse is the external database pooler's job. |

!!! info "Supabase"
    Register the **transaction pooler** URI (port 6543, `<region>.pooler.supabase.com`). Connections are opened per request: session mode (port 5432) pins one server session per client connection and caps at about 15 sessions, which concurrent requests can exhaust; direct connections (`db.<ref>.supabase.co`) bypass the pooler entirely. Non-transaction Supabase URIs are accepted with a warning. The stack is transaction-mode compatible: psycopg2 issues no named prepared statements, and the frontend opens its per-request client with `prepare: false`.

### Scope of the external SQL connection

An external `database_config` is **document-scoped**. Only the tables that participate in document ingestion and retrieval-side filtering are routed to the project's external Postgres. Conversation, project, analytics, auth, and workflow data always live on the host platform's main DB regardless of whether `database_config` is set.

When `qdrant_config` is **not** set, embeddings also live on the external DB (the platform's pgvector path uses the documents engine). When `qdrant_config` **is** set, the external DB stores documents only; embeddings go to Qdrant.

| Lives in external DB (when `database_config` is set) | Always lives on host main DB |
| --- | --- |
| `documents` | `conversations` |
| `documents_in_progress` | `messages` |
| `documents_failed` | `projects` |
| `doc_groups` | `project_stats` |
| `documents_doc_groups` | `llm-convo-monitor` |
| `embeddings` *(when `qdrant_config` is not set)* | `pre_authorized_api_keys` |
| | `project_external_connections` (the routing table itself) |

The external DB schema must therefore provide the six document-side tables (five plus `embeddings` when running on pgvector). Conversation history, project metadata, stats dashboards, and API key resolution all read/write the host DB.

### External Postgres provisioning (pgvector projects)

Before activating a `database_config` row, the operator must apply the platform's migrations on the external Postgres. The required objects are:

- `pgvector` extension (`CREATE EXTENSION IF NOT EXISTS vector;`)
- Tables:
    - `embeddings` — vectorized chunks (4096-dim by default; see migration 0007).
    - `documents`, `documents_in_progress`, `documents_failed`
    - `doc_groups`, `documents_doc_groups`
- Stored procedures: `add_document_to_group`, `add_document_to_group_url` (frontend migrations `0001_custom_functions.sql` / `0007_embeddings_table.sql`).

The frontend ships these as Drizzle migrations under `apps/frontend/src/db/migrations/`. Apply migrations 0006 / 0007 (pgvector + embeddings) and the migrations that create the document tables on the external Postgres before flipping `is_active = true`. The step-by-step procedure, including the `infra/db/external-migrations/apply.sh` helper, is on the [operators page](external-connections.md).

In code, the routing rule is enforced by two `ConnectionManager` accessors:

- `get_documents_sql_db(project_name)` — returns the project's external DB if configured, else the host. Use for document-scoped queries only.
- `get_sql_db()` — always returns the host main DB. Use for everything else.

## Qdrant config

Every Qdrant config has one required collection (`default_collection`). All ingest writes and single-collection deletes target this collection. Add an optional `collections` array to fan out reads across additional collections in parallel.

### Required: `default_collection`

`default_collection` must be set on every Qdrant config — it is the project's primary collection.

```json
{
  "url": "https://qdrant.example.com",
  "api_key": "your-qdrant-api-key",
  "port": 6333,
  "https": true,
  "default_collection": "my-project-collection",
  "skip_quantization_rescore": true
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | **Yes** | Qdrant server URL |
| `api_key` | string | **Yes** | API key for Qdrant authentication |
| `port` | integer | **Yes** | Qdrant port (e.g. `6333`) |
| `default_collection` | string | **Yes** | Primary Qdrant collection. All ingest writes and single-collection deletes target this collection. Always searched on read. |
| `https` | boolean | No | Whether to use HTTPS. Default: `false`. |
| `collections` | array | No | Additional collections to fan out searches across. See [Optional `collections`](#optional-collections-fan-out-search) below. |
| `skip_quantization_rescore` | boolean | No | Skip quantization rescore during search. Default: `true`. |
| `apply_course_filter` | boolean | No | Whether search constrains payload `course_name`. Default: `true`. Set to `false` for shared corpora (PubMed, patents, …) that are not partitioned by project. Distinct from per-collection `use_filter`, which drops the entire search filter. |
| `embedding` | object | No | **Deprecated.** Use the top-level `embedding_config` column instead. Still honored as a fallback when no top-level config is present. See [Embedding provider config](#embedding-provider-config) below. |

### Optional: `collections` (fan-out search)

Add `collections` when your project needs to search across multiple Qdrant collections in parallel — for example, combining results from PubMed, patents, and your own document collection. When present, every read fans out across `default_collection` plus every entry in `collections`, with results merged and sorted by score.

```json
{
  "url": "https://qdrant.example.com",
  "api_key": "your-qdrant-api-key",
  "port": 6333,
  "https": true,
  "default_collection": "main-documents",
  "collections": [
    {
      "name": "pubmed-articles",
      "top_n": 50,
      "use_filter": false,
      "processor": "pubmed"
    },
    {
      "name": "us-patents",
      "top_n": 30,
      "processor": "patents"
    },
    {
      "name": "ncbi-books",
      "processor": "ncbi_books"
    },
    {
      "name": "clinical-trials",
      "processor": "clinical_trials"
    }
  ],
  "parallel": true,
  "sort_combined": true
}
```

!!! info "`default_collection` is auto-included in fan-out search"
    You do not need to list it inside `collections`. If you do list a collection whose `name` matches `default_collection`, the entry's options (`top_n`, `use_filter`, `processor`) take effect; otherwise the default is searched with no per-collection overrides. **Ingest writes always go to `default_collection` only**, regardless of how many entries are in `collections`.

#### Per-collection fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | **Yes** | Qdrant collection name |
| `top_n` | integer | No | Maximum results to retrieve from this collection. Defaults to the request-level `top_n` (typically 100). |
| `use_filter` | boolean | No | Whether to apply the search filter (`conversation_id` / `doc_groups` / optional `course_name`) to this collection. Default: `true`. Set to `false` for shared collections that should be searched unfiltered. Distinct from `apply_course_filter`, which only drops the `course_name` constraint. |
| `processor` | string | No | Post-processor key for normalizing results. One of: `pubmed`, `patents`, `ncbi_books`, `clinical_trials`. See [Post-processors](#post-processors-for-vector-search) below. |

#### Top-level fan-out settings

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `parallel` | boolean | `true` | Search all collections in parallel using a thread pool. |
| `sort_combined` | boolean | `true` | Sort the combined results from all collections by score (descending). |

## Embedding provider config

The platform reads embedding overrides from the top-level **`embedding_config`** column on `project_external_connections`. The shape below applies to both vector engines (Qdrant and pgvector). If omitted, the platform uses the default embedding model from environment variables.

!!! note "Backward compatibility"
    An `embedding` key nested inside `qdrant_config` is still honored as a fallback so existing Qdrant projects keep working. New projects should set `embedding_config` directly.

### OpenAI-compatible provider

`embedding_config` (top-level column) plaintext shape:

```json
{
  "provider": "openai",
  "model": "text-embedding-3-small",
  "api_key": "sk-your-openai-key",
  "api_base": "https://api.openai.com/v1",
  "query_instruction": "Represent the query for retrieval:"
}
```

### Ollama provider

```json
{
  "provider": "ollama",
  "model": "nomic-embed-text",
  "base_url": "http://localhost:11434"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | string | **Yes** | `"openai"` or `"ollama"`. The Zod validator rejects other values. |
| `model` | string | No | Embedding model name. Falls back to env `EMBEDDING_MODEL`. |
| `api_key` | string | No | OpenAI API key. Only for the `openai` provider. Falls back to env `OPENAI_API_KEY`. |
| `api_base` | string | No | OpenAI-compatible API base URL. Only for the `openai` provider. Falls back to env `EMBEDDING_API_BASE`. |
| `base_url` | string | Required (ollama) | Ollama server URL (e.g. `http://localhost:11434`). Required when `provider` is `"ollama"`. |
| `query_instruction` | string | No | Prefix instruction for Qwen embedding models. Applied as `Instruct: {instruction}\nQuery:{query}` at query time. |

!!! info
    The `query_instruction` is only applied during **query embedding** for Qwen models. Documents are embedded without the instruction prefix during ingest.

## Post-processors for vector search

Post-processors normalize search results from specialized Qdrant collections into the standard payload format used by the retrieval pipeline. They are invoked automatically during multi-collection search when the `processor` key is set on a collection entry.

### Standard payload fields

Every post-processor maps collection-specific fields to these standard fields:

| Field | Description |
| --- | --- |
| `page_content` | The main text content of the result |
| `readable_filename` | Human-readable source name (prefixed by data source) |
| `s3_path` | Normalized storage path |
| `course_name` | Project/course name (set to the querying project) |
| `url` | Link to the original source |
| `pagenumber` | Page or section number within the source document |

### Available post-processors

| Processor key | Source data | What it does |
| --- | --- | --- |
| `pubmed` | PubMed articles | Prefixes `"Pubmed: "` to `readable_filename`. Normalizes `s3_path` to the `pubmed/` prefix. Maps `pagenumber` from payload. |
| `patents` | USPTO patents | Extracts the `text` field as `page_content`. Uses `uspto_url` as `url`. Prefixes `"Patent: "` to the filename. Normalizes `s3_path` to `patents/`. |
| `ncbi_books` | NCBI books | Prefixes `"NCBI Book: "` to `readable_filename`. Maps `page_number` to `pagenumber`. Normalizes `s3_path` to the `ncbi-output/` prefix. |
| `clinical_trials` | ClinicalTrials.gov | Extracts `text` as `page_content`. Prefixes `"Clinical Trial: "` to the filename. Normalizes `s3_path` to the `clinical-trials/` prefix. |

!!! info
    Collections **without** a `processor` key return results as-is, with no field transformation. The processor only runs on collections that explicitly set the `processor` field in their multi-collection config entry.
