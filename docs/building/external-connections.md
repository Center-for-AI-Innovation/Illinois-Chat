---
description: >-
  Connect your own S3-compatible storage, PostgreSQL, or Qdrant infrastructure
  to a project. Projects without external connections use the shared default
  infrastructure.
---

# External Connections

External connections let a project use **your own infrastructure** — a private S3-compatible bucket, a dedicated PostgreSQL database, or a self-hosted Qdrant instance — instead of the shared platform resources.

!!! info "Zero setup by default"
    Projects without an external connection need nothing. They automatically use the shared platform infrastructure: the default object-storage bucket, the platform Postgres (with pgvector for embeddings), and the default embedding model.

!!! note "Who sets this up"
    External connections are created and managed by platform super admins, not from the project pages. On the hosted site, contact support using the address in the page footer to request one for your project. Operators running their own deployment: see [External Connections Setup](../self-hosting/external-connections.md) for provisioning and the registration CLI.

This is useful when you need:

- **Data isolation** — keep documents and embeddings in your own cloud accounts.
- **Self-hosted vector search** — run your own Qdrant cluster with custom collections.
- **Multi-collection search** — query multiple Qdrant collections (e.g., PubMed, Patents, NCBI Books) in parallel and merge results.
- **Custom embedding models** — use a different embedding provider (OpenAI-compatible or Ollama) per project.

## Supported connection types

### S3-compatible object storage

Controls where uploaded documents and exported files are stored. Configure this when you have a private S3 bucket or a self-hosted S3-compatible store (Silo, MinIO, and the like).

### PostgreSQL database

Controls where **document metadata and embeddings** are stored: the `documents`, `documents_in_progress`, `documents_failed`, `doc_groups`, `documents_doc_groups` and `embeddings` tables. Configure this when you want a project's document inventory and its vectors to live in your own Postgres.

!!! info "Embeddings follow the documents database"
    When a database connection is set and no Qdrant connection is, the same external Postgres holds both documents and embeddings, using pgvector. The external database must have the `pgvector` extension installed and the platform's migrations applied before the connection is activated; the [setup guide](../self-hosting/external-connections.md) covers this.

!!! info "The external database is document-scoped"
    Conversations, messages, project metadata, analytics, API keys and tool state always remain on the platform's main database. They are never written to a project's external Postgres, even when a database connection is set.

### Qdrant vector database

Controls where vector embeddings live and how retrieval works. When a Qdrant connection is set, embeddings live in Qdrant instead of pgvector. Every Qdrant connection names a **default collection**: the project's primary collection, where all ingest writes go and which is always included in search.

Optionally, additional collections can be listed to fan searches out across them in parallel. Each can apply a post-processor that normalizes results from specialized data sources (PubMed, Patents, NCBI Books, Clinical Trials). The default collection is searched alongside the listed ones automatically.

### Embedding model (per project)

A per-project embedding-model override, independent of which vector engine the project uses. When omitted, the platform default applies.

### Which store a project ends up using

1. Qdrant connection present → vectors live in that Qdrant.
2. Otherwise → vectors live in pgvector. If a database connection is present, that **same external Postgres** stores both documents and embeddings.
3. No connections → the platform Postgres (with pgvector) for both.

There is no environment switch for this; the project's connection record alone decides.

## How it works

1. Connection details are stored encrypted (AES-256-GCM) and only ever shown back masked (`****MPLE`), so secrets are not exposed through any API.
2. On every query and ingest job, the platform reads the project's connection record and routes traffic to the right infrastructure. Only **active** connections are honored, in both the chat backend and the ingest worker, so deactivating a connection takes effect everywhere.
3. Nothing is cached: the record is read and clients are built per request, so a change takes effect on the next request or job.

## Further reading

- [External Connections Setup](../self-hosting/external-connections.md) — provisioning an external Postgres, applying migrations, registering connections with the CLI.
- [Configuration reference](../self-hosting/external-connections-config.md) — field-by-field schemas, post-processors, embedding providers.
- [Lightweight Ingest Bridge](../contributing/ingest-bridge.md) — bulk-ingesting into a project whose storage lives behind an external connection.
