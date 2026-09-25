"""
WorkerConnectionResolver: Lightweight per-project connection resolution for the ingest worker.

Queries project_external_connections to resolve Qdrant and S3 overrides per project.
Projects without external configs get None values (caller uses env-based defaults).

Nothing is cached (issue #228): each resolve() reads the project's row and
builds fresh clients, so a connection edit takes effect on the next job
instead of up to 30 minutes later. External engines use a NullPool, matching
the worker's host engine in rmsql.py; connection reuse is the external
database pooler's job.

Self-contained within rabbitmq/ -- crypto functions are embedded to avoid
cross-package imports (worker Docker image only includes this directory).
"""

import base64
import hashlib
import json
import logging
import os
from dataclasses import dataclass
from typing import Literal, Optional

import boto3
from botocore.config import Config
from qdrant_client import QdrantClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine as SAEngine
from sqlalchemy.pool import NullPool

try:
    from vector_store import PgVectorStore
except ModuleNotFoundError:
    from ai_ta_backend.rabbitmq.vector_store import PgVectorStore

try:
    from rmsql import SQLAlchemyIngestDB
except ModuleNotFoundError:
    from ai_ta_backend.rabbitmq.rmsql import SQLAlchemyIngestDB

logger = logging.getLogger(__name__)


def _parse_allowed_embedding_providers() -> tuple:
    """Parse ``ALLOWED_EMBEDDING_PROVIDERS`` (comma-separated, lowercased).

    Mirrors ``retrieval_service._parse_allowed_embedding_providers`` and the
    frontend ``validation.ts`` parser. Empty / unset → default
    ``('openai', 'ollama')`` — the providers ingest knows how to embed with.
    """
    raw = os.getenv("ALLOWED_EMBEDDING_PROVIDERS")
    if not raw:
        return ("openai", "ollama")
    parsed = tuple(p for p in (s.strip().lower() for s in raw.split(",")) if p)
    if not parsed:
        raise ValueError(
            "ALLOWED_EMBEDDING_PROVIDERS is set but parses to an empty list. "
            "Unset it or supply at least one provider."
        )
    return parsed


ALLOWED_EMBEDDING_PROVIDERS: tuple = _parse_allowed_embedding_providers()


# ── Embedded Decryption (mirrors ai_ta_backend/utils/crypto.py) ──────────

def _decrypt(encrypted_text: str, key: str) -> str:
    """AES-256-GCM decryption. Format: v1.<ciphertext+tag base64>.<iv base64>"""
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    version, encrypted_base64, iv_base64 = encrypted_text.split('.')
    if version != 'v1':
        raise ValueError(f'Unsupported encryption version: {version}')

    pw_hash = hashlib.sha256(key.encode('utf-8')).digest()
    iv = base64.b64decode(iv_base64)
    encrypted = base64.b64decode(encrypted_base64)
    tag = encrypted[-16:]
    ciphertext = encrypted[:-16]

    cipher = Cipher(algorithms.AES(pw_hash), modes.GCM(iv, tag), backend=default_backend())
    decryptor = cipher.decryptor()
    return (decryptor.update(ciphertext) + decryptor.finalize()).decode('utf-8')


def _decrypt_config(stored: dict) -> Optional[dict]:
    """Decrypt a {"encrypted": "v1.xxx.yyy"} blob from project_external_connections."""
    if not stored:
        return None
    encrypted_str = stored.get("encrypted")
    if not encrypted_str:
        return None
    key = os.environ.get('ENCRYPTION_MASTER_KEY', '')
    if not key:
        logger.warning("ENCRYPTION_MASTER_KEY not set; cannot decrypt external config")
        return None
    plaintext = _decrypt(encrypted_str, key)
    return json.loads(plaintext)


# ── Resolved Connections Dataclass ────────────────────────────────────────

@dataclass
class ResolvedConnections:
    """Holds per-project overrides. None fields mean 'use defaults'.

    ``engine_kind`` is always populated:
      - 'qdrant'  → external Qdrant; ``qdrant_client`` and
        ``qdrant_collection_name`` are set.
      - 'pgvector' → pgvector engine; ``pgvector_store`` is set (bound to
        the per-project external pg when ``database_config`` is present,
        else None so the worker falls back to its host pgvector store).
    """
    qdrant_client: Optional[QdrantClient] = None
    qdrant_collection_name: Optional[str] = None
    s3_client: Optional[object] = None
    s3_bucket_name: Optional[str] = None
    engine_kind: Literal['qdrant', 'pgvector'] = 'pgvector'
    documents_sql_engine: Optional[SAEngine] = None
    pgvector_store: Optional[PgVectorStore] = None

    # Per-project embedding override. None fields mean "use env defaults".
    # ``query_instruction`` is deliberately absent: it is a query-time prefix
    # and must not be applied to ingested document chunks (commit 1a8c2e9).
    embedding_provider: Optional[str] = None       # 'openai' | 'ollama'
    embedding_model: Optional[str] = None
    embedding_api_key: Optional[str] = None         # openai
    embedding_api_base: Optional[str] = None        # openai (base URL)
    embedding_base_url: Optional[str] = None        # ollama server root

    @property
    def has_overrides(self) -> bool:
        return any(
            [self.qdrant_client, self.s3_client,
             self.documents_sql_engine, self.pgvector_store,
             self.embedding_provider]
        )


# ── WorkerConnectionResolver ─────────────────────────────────────────────

class WorkerConnectionResolver:
    """Resolves per-project infrastructure connections for the ingest worker."""

    def __init__(self, sql_session: SQLAlchemyIngestDB):
        self._sql = sql_session

    # ── Config lookup ──

    def _get_raw_config(self, project_name: str) -> Optional[dict]:
        return self._sql.getExternalConnection(project_name)

    @staticmethod
    def _decrypt_field(config: Optional[dict], project_name: str,
                       field: str) -> Optional[dict]:
        """Decrypt one field of an already-read config row.

        A decrypt failure logs and returns None so the project falls back to
        env defaults: one misconfigured project must not kill the consumer
        loop (this diverges from the request-time backend, which raises).
        """
        if not config:
            return None
        encrypted_blob = config.get(field)
        if not encrypted_blob:
            return None
        try:
            return _decrypt_config(encrypted_blob)
        except Exception as e:
            logger.error("Failed to decrypt %s for project %s: %s", field, project_name, e)
            return None

    # ── Public API ──

    def resolve(self, project_name: str) -> ResolvedConnections:
        """Resolve per-project Qdrant / pgvector / SQL / S3 overrides.

        Returns a ResolvedConnections with engine_kind set:
          - 'qdrant'  when ``qdrant_config`` is present
          - 'pgvector' otherwise; ``database_config`` (if present) binds
            ``documents_sql_engine`` and ``pgvector_store`` to the external pg.
        """
        if not project_name:
            return ResolvedConnections()

        result = ResolvedConnections()
        config = self._get_raw_config(project_name)

        qdrant_config = self._decrypt_field(config, project_name, "qdrant_config")
        if qdrant_config:
            result.engine_kind = 'qdrant'
            result.qdrant_client = self._create_qdrant(project_name, qdrant_config)
            result.qdrant_collection_name = qdrant_config.get("default_collection")

        # database_config can coexist with qdrant_config (SQL stays on the
        # external pg even when vector lives in Qdrant).
        db_config = self._decrypt_field(config, project_name, "database_config")
        if db_config:
            engine = self._create_engine(project_name, db_config)
            result.documents_sql_engine = engine
            if result.engine_kind == 'pgvector':
                result.pgvector_store = PgVectorStore(engine=engine)

        s3_config = self._decrypt_field(config, project_name, "s3_config")
        if s3_config:
            result.s3_client = self._create_s3(project_name, s3_config)
            result.s3_bucket_name = s3_config.get("bucket_name")

        # Embedding override. Mirrors retrieval_service._resolve_embedding_client
        # (ingest-only: no query_instruction). Legacy fallback: an ``embedding``
        # block nested in qdrant_config, used by projects predating the column.
        emb_cfg = self._decrypt_field(config, project_name, "embedding_config")
        if not emb_cfg and qdrant_config:
            emb_cfg = qdrant_config.get("embedding")
        if emb_cfg:
            self._resolve_embedding(result, project_name, emb_cfg)

        if result.has_overrides:
            logger.info(
                "Resolved external connections for project: %s (engine=%s)",
                project_name, result.engine_kind,
            )

        return result

    # ── Embedding ──

    def _resolve_embedding(self, result: ResolvedConnections,
                           project_name: str, emb_cfg: dict) -> None:
        """Populate the embedding fields on ``result`` from a decrypted
        embedding config. On a disallowed/misconfigured provider, log and leave
        the fields unset so ingest falls back to env defaults — one bad project
        must not crash the worker loop (diverges from the request-time reference,
        which raises)."""
        provider = emb_cfg.get("provider", "openai")
        if provider not in ALLOWED_EMBEDDING_PROVIDERS:
            logger.error(
                "Disallowed embedding provider %r for project %s (allowed: %s); "
                "falling back to env default embedding",
                provider, project_name, ALLOWED_EMBEDDING_PROVIDERS,
            )
            return

        if provider == "ollama":
            base_url = emb_cfg.get("base_url") or os.environ.get("OLLAMA_SERVER_URL")
            if not base_url:
                logger.error(
                    "embedding_config provider='ollama' for project %s has no "
                    "base_url and OLLAMA_SERVER_URL is unset; falling back to env "
                    "default embedding", project_name,
                )
                return
            result.embedding_base_url = base_url
        else:  # openai (or any future OpenAI-compatible provider)
            result.embedding_api_key = emb_cfg.get("api_key")
            result.embedding_api_base = emb_cfg.get("api_base")

        result.embedding_provider = provider
        result.embedding_model = emb_cfg.get("model")

    # ── Qdrant ──

    @staticmethod
    def _create_qdrant(project_name: str, qdrant_config: dict) -> QdrantClient:
        logger.info("Creating external Qdrant client for project: %s", project_name)
        return QdrantClient(
            url=qdrant_config["url"],
            api_key=qdrant_config["api_key"],
            port=int(qdrant_config["port"]),
            https=qdrant_config.get("https", False),
            timeout=20,
        )

    # ── Documents SQL engine ──

    @staticmethod
    def _create_engine(project_name: str, db_config: dict) -> SAEngine:
        """Build an engine for a project's external Postgres.

        NullPool: the engine lives for one job, so pooling here would hold
        sockets open past its usefulness. Connection reuse is the external
        database pooler's job (the documented setup is a Supabase transaction
        pooler), and this matches the worker's host engine in rmsql.py.
        """
        logger.info("Creating external SQL engine for project: %s", project_name)
        return create_engine(db_config["connection_uri"], poolclass=NullPool)

    # ── S3 ──

    @staticmethod
    def _create_s3(project_name: str, s3_config: dict):
        logger.info("Creating external S3 client for project: %s", project_name)
        endpoint_url = s3_config.get("endpoint_url")
        region = s3_config.get("region")
        client_kwargs = dict(
            aws_access_key_id=s3_config["aws_access_key_id"],
            aws_secret_access_key=s3_config["aws_secret_access_key"],
            endpoint_url=endpoint_url,
            config=Config(s3={'addressing_style': 'path'}) if endpoint_url else None,
        )
        if region:
            client_kwargs["region_name"] = region
        # A fresh Session per client: boto3's default module-level session is
        # not thread-safe and clients are now built per job.
        return boto3.session.Session().client("s3", **client_kwargs)
