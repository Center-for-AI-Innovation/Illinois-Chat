"""
ConnectionManager: Per-project connection resolution.

Resolves S3, Postgres, and Qdrant connections on a per-project basis.
Projects without external configs use the default (env-based) connections.

Nothing is cached (issue #228). Every call reads the project's row from
`project_external_connections`, decrypts the fields it needs, and builds the
client it returns. A cached config or client is only correct until someone
edits the project's connection, and the previous TTL-based caches (5 min for
configs, 30 min for live clients) had no cross-process invalidation: a config
change took up to 30 minutes to reach this service. Resolving per request
removes that window. Connection cost is delegated to the external database's
own pooler, so external engines use a NullPool exactly like the host engines
in `database/sql.py`.

This module is **read-only**. CRUD for `project_external_connections` lives in
the Next.js frontend (`uiuc-chat-frontend`
`src/pages/api/UIUC-api/projectConnections*`). The table schema is owned by
the frontend Drizzle migrations; the SQLAlchemy `ProjectExternalConnection`
model mirrors that table here purely so the read path can use ORM queries.
Do not re-add write helpers to this service.
"""

import logging
import os

import boto3
from botocore.config import Config
from injector import inject
from qdrant_client import QdrantClient
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool


from ai_ta_backend.database.sql import SQLDatabase
from ai_ta_backend.database.vector import VectorDatabase
from ai_ta_backend.database.aws import AWSStorage
from ai_ta_backend.utils.crypto import decrypt_config

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Resolves per-project infrastructure connections."""

    @inject
    def __init__(self, sql_db: SQLDatabase, aws: AWSStorage):
        self._sql_db = sql_db
        self._aws = aws

        # Default connection params from env (for projects without external config)
        self._default_qdrant_collection = os.environ.get("QDRANT_COLLECTION_NAME", "")
        self._default_s3_bucket = os.environ.get("S3_BUCKET_NAME", "")

    # ── Config Resolution ──

    def _get_config(self, project_name: str) -> dict | None:
        """Read the external config row for a project. None if there is none.

        `getExternalConnection` filters on `is_active`, so a deactivated row
        reads as absent and the project falls back to the env defaults.
        """
        return self._sql_db.getExternalConnection(project_name)

    @staticmethod
    def _decrypt_field(config: dict | None, field: str) -> dict | None:
        """Decrypt one field of an already-read config row."""
        if not config:
            return None
        encrypted_blob = config.get(field)
        if not encrypted_blob:
            return None
        return decrypt_config(encrypted_blob)

    def _get_decrypted_field(self, project_name: str, field: str) -> dict | None:
        """Get a specific decrypted config field (s3_config, database_config, qdrant_config)."""
        return self._decrypt_field(self._get_config(project_name), field)

    # ── Database Resolution ──
    #
    # Routing rule: external SQL connections are scoped to **document-related**
    # data only (documents, doc_groups, documents_doc_groups,
    # documents_in_progress, documents_failed). Conversation, project, stats,
    # auth, and workflow data always live on the host main DB regardless of a
    # project's database_config.
    #
    #   get_documents_sql_db(project_name) -> external if configured, else host
    #   get_sql_db()                        -> always the host main DB
    #
    # Pick the accessor based on which tables the call will touch.

    def get_sql_db(self) -> "SQLDatabase":
        """Return the host main SQLDatabase.

        Use this for all non-document data: conversations, messages, projects,
        project_stats, llm-convo-monitor, pre_authorized_api_keys,
        n8n_workflows, project_external_connections. These tables always live
        on the host platform's database, never on a project's external DB.
        """
        return self._sql_db

    def get_documents_sql_db(self, project_name: str) -> "SQLDatabase":
        """Return the SQLDatabase that owns document-related tables for a project.

        Returns a project-specific SQLDatabase bound to the external engine
        when the project has a `database_config` set in
        `project_external_connections`; otherwise returns the host main DB.
        Only call this for document-scoped operations: documents, doc_groups,
        documents_doc_groups, documents_in_progress, documents_failed.
        """
        db_config = self._get_decrypted_field(project_name, "database_config")
        if not db_config:
            return self._sql_db

        return SQLDatabase(engine=self._create_engine(project_name, db_config))

    @staticmethod
    def _create_engine(project_name: str, db_config: dict):
        """Build an engine for a project's external Postgres.

        NullPool: the engine lives for one request, so pooling here would hold
        sockets open past its usefulness. Connection reuse is the external
        database pooler's job (the documented setup is a Supabase transaction
        pooler), and this matches the host engines in `database/sql.py`.
        """
        logger.info(f"Creating external DB engine for project: {project_name}")
        return create_engine(db_config["connection_uri"], poolclass=NullPool)

    # ── Vector Engine Resolution ──
    #
    # Engine selection rule (resolved per request):
    #   1. Project has an active non-null qdrant_config  → external Qdrant
    #   2. Else                                          → pgvector
    #      (host pgvector by default; per-project external pg when the
    #       project has a `database_config` — embeddings follow docs.)
    #
    # ``get_vector_db(project_name)`` returns a VectorDatabase that always
    # knows which engine to use: Qdrant-backed when `qdrant_config` is set,
    # pgvector-backed (bound to per-project or host pg) otherwise. Callers
    # do not need to branch on engine kind.

    def get_vector_engine_kind(self, project_name: str) -> str:
        """Return 'qdrant' or 'pgvector' for the given project.

        Pure decision; never builds a client. Use this to branch ingest /
        doc_groups payload writes between Qdrant setPayload and pgvector
        UPDATE.
        """
        if self._get_decrypted_field(project_name, "qdrant_config"):
            return "qdrant"
        return "pgvector"

    def get_vector_db(self, project_name: str) -> "VectorDatabase":
        """Return a VectorDatabase for the project.

        - ``qdrant_config`` present → VectorDatabase wired to that Qdrant.
        - Otherwise → VectorDatabase wired to pgvector (per-project pg when
          ``database_config`` is present, else the host store, which the
          VectorDatabase resolves lazily). All existing VectorDatabase
          methods (execute_search, delete, upsert, etc.) dispatch internally.
        """
        config = self._get_config(project_name)

        qdrant_config = self._decrypt_field(config, "qdrant_config")
        if qdrant_config:
            return VectorDatabase(
                qdrant_client=self._create_qdrant(project_name, qdrant_config),
                qdrant_config=qdrant_config,
            )

        db_config = self._decrypt_field(config, "database_config")
        return VectorDatabase(
            pgvector_store=self._create_pgvector_store(project_name, db_config)
        )

    def _create_pgvector_store(self, project_name: str | None, db_config: dict | None):
        """Per-project PgVectorStore, or None for the host store.

        Returning None lets ``VectorDatabase.pgvector_store`` resolve the host
        singleton lazily, so pure-Qdrant deployments never import psycopg2.
        The import stays inside the function for the same reason.
        """
        if not db_config:
            return None
        from ai_ta_backend.database.vector_store import PgVectorStore

        return PgVectorStore(engine=self._create_engine(project_name, db_config))

    @staticmethod
    def _create_qdrant(project_name: str, qdrant_config: dict) -> QdrantClient:
        logger.info(f"Creating external Qdrant client for project: {project_name}")
        return QdrantClient(
            url=qdrant_config["url"],
            api_key=qdrant_config["api_key"],
            port=int(qdrant_config["port"]),
            https=qdrant_config.get("https", False),
            timeout=20,
        )

    # ── S3 Client Resolution ──

    def get_s3_client(self, project_name: str) -> tuple["AWSStorage", str]:
        """Returns (AWSStorage, bucket_name) for the given project.
        Returns a project-specific AWSStorage wrapping the external S3 client,
        or the default AWSStorage if no external config exists.
        """
        s3_config = self._get_decrypted_field(project_name, "s3_config")
        if not s3_config:
            return self._aws, self._default_s3_bucket

        aws = self._create_s3(project_name, s3_config)
        bucket_name = s3_config.get("bucket_name", self._default_s3_bucket)
        return aws, bucket_name

    @staticmethod
    def _create_s3(project_name: str, s3_config: dict) -> AWSStorage:
        logger.info(f"Creating external S3 client for project: {project_name}")
        endpoint_url = s3_config.get("endpoint_url")
        region = s3_config.get("region")
        client_kwargs = dict(
            aws_access_key_id=s3_config["aws_access_key_id"],
            aws_secret_access_key=s3_config["aws_secret_access_key"],
            endpoint_url=endpoint_url,
            config=Config(s3={"addressing_style": "path"}) if endpoint_url else None,
        )
        if region:
            client_kwargs["region_name"] = region
        # A fresh Session per client: boto3's default module-level session is
        # not thread-safe, and clients are now built per request across the
        # gunicorn thread pool.
        client = boto3.session.Session().client("s3", **client_kwargs)
        return AWSStorage(s3_client=client)

    # NOTE: Connection-testing endpoints live in the Next.js frontend
    # (uiuc-chat-frontend src/utils/projectConnections/tester.ts). The
    # backend never probes third-party endpoints on behalf of the UI; it
    # only resolves configs for runtime dispatch.
