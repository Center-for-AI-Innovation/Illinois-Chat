"""
WorkerConnectionResolver: Lightweight per-project connection resolution for the ingest worker.

Queries project_external_connections to resolve Qdrant and S3 overrides per project.
Projects without external configs get None values (caller uses env-based defaults).

A field that is present but cannot be used (it cannot be decrypted, is not a
non-empty JSON object, or the client cannot be built from it) raises
ConnectionConfigError, which names the project and the field, instead of
leaving that field to the host's resources. An envelope with nothing in
`encrypted` still means no override, and so do the embedding fallbacks in
_resolve_embedding (a provider that is not allowed, ollama with no server URL).
The resolver logs nothing for a ConnectionConfigError: the caller logs it once.

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
import re
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Literal, Optional

import boto3
from botocore.config import Config
from qdrant_client import QdrantClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine as SAEngine
from sqlalchemy.exc import ArgumentError, NoSuchModuleError
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


class ConnectionConfigError(ValueError):
    """A stored connection field of a project is present but cannot be used.

    ``field`` is the column (database_config, qdrant_config, s3_config or
    embedding_config). ``cause`` is an exception type name or a fixed phrase,
    never config text: the text of a decrypt, JSON or driver error can quote the
    stored config, a URI or a key. Always raised ``from None`` for the same reason.

    A ValueError, so code that already handles the documents-engine builder's
    ValueError keeps working.
    """

    def __init__(self, project_name: str, field: str, cause: str, message: Optional[str] = None):
        self.project_name = project_name
        self.field = field
        self.cause = cause
        super().__init__(message or "the connection %s of project %s cannot be used (%s)" %
                         (field, project_name, cause))

    def __reduce__(self):
        # The default rebuilds the error from args, which is the message alone.
        return type(self), (self.project_name, self.field, self.cause, str(self))


class _KeyNotSet(Exception):
    """ENCRYPTION_MASTER_KEY is unset, so no stored connection can be decrypted."""


@contextmanager
def _field_errors(project_name: str, field: str):
    """Turn any error while reading or building one field into ConnectionConfigError for it."""
    try:
        yield
    except ConnectionConfigError:
        raise
    except Exception as e:
        # The type only: the text of the error can hold the decrypted config.
        raise ConnectionConfigError(project_name, field, _type_name(e)) from None


def _type_name(error: Exception) -> str:
    """The class name, with its module when the name alone says nothing (binascii.Error)."""
    name = type(error).__name__
    return "%s.%s" % (type(error).__module__, name) if name == "Error" else name


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


def _decrypt_config(stored: dict):
    """Decrypt a {"encrypted": "v1.xxx.yyy"} blob from project_external_connections.

    Returns whatever JSON value the blob holds; the caller checks that it is an object.
    Raises _KeyNotSet when ENCRYPTION_MASTER_KEY is unset.
    """
    key = os.environ.get('ENCRYPTION_MASTER_KEY', '')
    if not key:
        raise _KeyNotSet()
    return json.loads(_decrypt(stored["encrypted"], key))


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


def _fresh(error: ConnectionConfigError) -> ConnectionConfigError:
    """The same error, to raise again from the public method's frame."""
    return ConnectionConfigError(error.project_name, error.field, error.cause, str(error))


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

        None when the field has no value: no row, a NULL column, or an envelope
        with nothing in `encrypted` (the frontend and the request-time backend
        read that envelope as absent too). Any other value must decrypt to a
        non-empty JSON object, or this raises; the caller turns an error that is not
        ConnectionConfigError into one for the field.
        """
        if not config:
            return None
        encrypted_blob = config.get(field)
        if not encrypted_blob:
            return None
        if isinstance(encrypted_blob, dict) and not encrypted_blob.get("encrypted"):
            return None
        try:
            value = _decrypt_config(encrypted_blob)
        except _KeyNotSet:
            raise ConnectionConfigError(project_name, field, "ENCRYPTION_MASTER_KEY is not set") from None
        if not isinstance(value, dict):
            raise ConnectionConfigError(project_name, field, "not a JSON object") from None
        if not value:
            raise ConnectionConfigError(project_name, field, "empty") from None
        return value

    # ── Public API ──

    def resolve(self, project_name: str) -> ResolvedConnections:
        """Resolve per-project Qdrant / pgvector / SQL / S3 overrides.

        Returns a ResolvedConnections with engine_kind set:
          - 'qdrant'  when ``qdrant_config`` is present
          - 'pgvector' otherwise; ``database_config`` (if present) binds
            ``documents_sql_engine`` and ``pgvector_store`` to the external pg.

        Raises ConnectionConfigError when a field is present but cannot be used.
        An error reading the host's project_external_connections row is not one:
        it keeps its own type, so the worker retries it.
        """
        if not project_name:
            return ResolvedConnections()
        config = self._get_raw_config(project_name)
        try:
            return self._resolve(project_name, config)
        except ConnectionConfigError as e:
            error = _fresh(e)
            config = None  # the stored row stays out of this frame's locals in the traceback
        # Raised here, outside the handler: the error then has no context, and its traceback
        # has no frame below this one. Those frames hold the decrypted config (Sentry reads
        # frame locals), and the context is the error that quotes it.
        raise error from None

    def _resolve(self, project_name: str, config: Optional[dict]) -> ResolvedConnections:
        result = ResolvedConnections()

        with _field_errors(project_name, "qdrant_config"):
            qdrant_config = self._decrypt_field(config, project_name, "qdrant_config")
            if qdrant_config:
                result.engine_kind = 'qdrant'
                result.qdrant_client = self._create_qdrant(project_name, qdrant_config)
                result.qdrant_collection_name = qdrant_config.get("default_collection")

        # database_config can coexist with qdrant_config (SQL stays on the
        # external pg even when vector lives in Qdrant).
        with _field_errors(project_name, "database_config"):
            db_config = self._decrypt_field(config, project_name, "database_config")
            if db_config:
                engine = self._create_engine(project_name, db_config)
                result.documents_sql_engine = engine
                if result.engine_kind == 'pgvector':
                    result.pgvector_store = PgVectorStore(engine=engine)

        with _field_errors(project_name, "s3_config"):
            s3_config = self._decrypt_field(config, project_name, "s3_config")
            if s3_config:
                result.s3_client = self._create_s3(project_name, s3_config)
                result.s3_bucket_name = s3_config.get("bucket_name")

        # Embedding override. Mirrors retrieval_service._resolve_embedding_client
        # (ingest-only: no query_instruction). Legacy: an ``embedding`` block nested
        # in qdrant_config, used by projects predating the column; an error in it
        # names qdrant_config.
        with _field_errors(project_name, "embedding_config"):
            emb_cfg = self._decrypt_field(config, project_name, "embedding_config")
            if emb_cfg:
                self._resolve_embedding(result, project_name, emb_cfg)
        if not emb_cfg and qdrant_config:
            with _field_errors(project_name, "qdrant_config"):
                legacy_cfg = qdrant_config.get("embedding")
                if legacy_cfg:
                    self._resolve_embedding(result, project_name, legacy_cfg)

        if result.has_overrides:
            logger.debug(
                "Resolved external connections for project: %s (engine=%s)",
                project_name, result.engine_kind,
            )

        return result

    def resolve_documents_engine(self, project_name: str) -> Optional[SAEngine]:
        """Only the project's documents database, or None when it uses the host one.

        For the worker's failure path. resolve() can fail on a part that is not the
        documents database (Qdrant, S3, the embedding config), and the status rows of the
        job must still be updated in the database where the producer wrote them.
        Raises ConnectionConfigError, as resolve() does, when database_config cannot be used.
        """
        if not project_name:
            return None
        config = self._get_raw_config(project_name)
        try:
            return self._documents_engine(project_name, config)
        except ConnectionConfigError as e:
            error = _fresh(e)
            config = None  # the stored row stays out of this frame's locals in the traceback
        # Outside the handler, for the reason given in resolve().
        raise error from None

    def _documents_engine(self, project_name: str, config: Optional[dict]) -> Optional[SAEngine]:
        with _field_errors(project_name, "database_config"):
            db_config = self._decrypt_field(config, project_name, "database_config")
            return self._create_engine(project_name, db_config) if db_config else None

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
        logger.debug("Creating external Qdrant client for project: %s", project_name)
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
        logger.debug("Creating external SQL engine for project: %s", project_name)
        uri = db_config["connection_uri"]
        try:
            return create_engine(uri, poolclass=NullPool, hide_parameters=True)
        except NoSuchModuleError:
            # The scheme names a driver that SQLAlchemy cannot load, for example postgres://.
            # The scheme holds no secret, so the message names it. `from None` for the same
            # reason as below.
            scheme = uri.split("://", 1)[0] if isinstance(uri, str) and "://" in uri else ""
            if not re.fullmatch(r"[A-Za-z0-9+.\-]{1,40}", scheme):
                scheme = "?"
            if scheme in ("postgresql", "postgresql+psycopg2"):
                # The scheme is good. What cannot be loaded is something else in the string,
                # a `plugin=` in the query for example.
                raise ConnectionConfigError(
                    project_name, "database_config", "NoSuchModuleError",
                    "the connection_uri of project %s is not a valid database URL" % project_name) from None
            raise ConnectionConfigError(
                project_name, "database_config", "NoSuchModuleError",
                "the connection_uri of project %s has the scheme %s://, which the backend cannot use; use "
                "postgresql://" % (project_name, scheme)) from None
        except (ArgumentError, ValueError) as e:
            # SQLAlchemy writes the string, or the part of it after the user name, into these
            # errors, and that text holds the password. `from None` keeps it out of the
            # traceback too.
            raise ConnectionConfigError(
                project_name, "database_config", type(e).__name__,
                "the connection_uri of project %s is not a valid database URL" % project_name) from None

    # ── S3 ──

    @staticmethod
    def _create_s3(project_name: str, s3_config: dict):
        logger.debug("Creating external S3 client for project: %s", project_name)
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
