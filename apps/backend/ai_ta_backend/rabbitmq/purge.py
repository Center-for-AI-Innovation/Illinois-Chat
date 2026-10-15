"""
Background purge of a deleted chatbot (project).

The delete request (frontend /api/UIUC-api/chatbotDeletion) only hides the
chatbot: it inserts a ``project_deletions`` row, removes the metadata and
enqueues ``{"deletion_id": N}`` on the delete queue. Everything heavy happens
here, in the worker:

  drain_ingest -> vectors -> documents -> conversations -> misc tables -> s3
  -> finalize (course_metadata + projects row, which frees the name)

Large chatbots can have millions of embeddings and S3 objects, so every step
deletes in small batches, each in its own short transaction, instead of one
huge DELETE that holds locks and bloats WAL. Steps are idempotent and the
finished ones are recorded in ``project_deletions.progress``, so a failed or
crashed job resumes where it stopped.

External stores (a project's own DB / Qdrant / S3 from
project_external_connections) are purged only when the requester ticked
``include_external``; otherwise they are left untouched.

Self-contained within rabbitmq/ (the worker image only ships this directory).
"""

import json
import logging
import os
import time
from typing import Any, Callable, Dict, List, Optional, Sequence

import boto3
from botocore.config import Config
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import ProgrammingError

try:
    from rmsql import SQLAlchemyIngestDB
    from connection_resolver import ResolvedConnections, WorkerConnectionResolver
except ModuleNotFoundError:
    from ai_ta_backend.rabbitmq.rmsql import SQLAlchemyIngestDB
    from ai_ta_backend.rabbitmq.connection_resolver import ResolvedConnections, WorkerConnectionResolver

logger = logging.getLogger(__name__)

BATCH_SIZE = int(os.getenv('DELETE_BATCH_SIZE', '2000'))
# Ingest children are killed after INGEST_SUBPROCESS_TIMEOUT, so an in-flight
# job cannot write for longer than that. Wait a little past it.
DRAIN_TIMEOUT = int(os.getenv('DELETE_INGEST_DRAIN_TIMEOUT',
                              str(int(os.getenv('INGEST_SUBPROCESS_TIMEOUT', '300')) + 120)))
DRAIN_POLL_SECONDS = 10
# A running job whose heartbeat is older than this is considered abandoned
# (worker died) and may be claimed again.
LEASE_SECONDS = int(os.getenv('DELETE_LEASE_SECONDS', '600'))
S3_DELETE_CHUNK = 1000  # S3 DeleteObjects hard limit

ACTIVE = "status <> 'completed'"


# ── project_deletions bookkeeping (host DB) ──────────────────────────────


def is_project_deleting(engine: Engine, project_name: str) -> bool:
    """True while a deletion for this name is pending, running or failed."""
    if not project_name:
        return False
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(f"SELECT 1 FROM project_deletions WHERE project_name = :n AND {ACTIVE} LIMIT 1"),
                {"n": project_name},
            ).first()
    except ProgrammingError:
        # Migration 0019 not applied yet: nothing can be mid-deletion, and
        # ingest must keep working.
        logger.warning("project_deletions table missing; treating %r as not deleting", project_name)
        return False
    return row is not None


def claim_deletion(engine: Engine, deletion_id: int) -> Optional[Dict[str, Any]]:
    """Atomically take ownership of a deletion job.

    Succeeds for pending/failed jobs and for running jobs whose heartbeat went
    stale (the worker that owned it died). Returns the row, or None when the
    job is completed or another worker holds a live lease.
    """
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                UPDATE project_deletions
                SET status = 'running',
                    attempts = attempts + 1,
                    started_at = COALESCE(started_at, now()),
                    heartbeat_at = now(),
                    error = NULL
                WHERE id = :id
                  AND (status IN ('pending', 'failed')
                       OR (status = 'running'
                           AND (heartbeat_at IS NULL
                                OR heartbeat_at < now() - make_interval(secs => :lease))))
                RETURNING id, project_name, project_id, include_external, progress, attempts
            """),
            {"id": deletion_id, "lease": LEASE_SECONDS},
        ).mappings().first()
    return dict(row) if row else None


def find_resumable_deletions(engine: Engine) -> List[int]:
    """Jobs left behind by a crash or a lost queue message."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id FROM project_deletions
                WHERE status = 'pending'
                   OR (status = 'running'
                       AND (heartbeat_at IS NULL
                            OR heartbeat_at < now() - make_interval(secs => :lease)))
                ORDER BY id
            """),
            {"lease": LEASE_SECONDS},
        ).all()
    return [r[0] for r in rows]


def _update_deletion(engine: Engine, deletion_id: int, sets: str, params: Dict[str, Any]) -> None:
    with engine.begin() as conn:
        conn.execute(text(f"UPDATE project_deletions SET {sets} WHERE id = :id"), {"id": deletion_id, **params})


# ── SQL helpers ──────────────────────────────────────────────────────────


def _table_exists(engine: Engine, table: str) -> bool:
    with engine.connect() as conn:
        return conn.execute(text("SELECT to_regclass(:t)"), {"t": f'public."{table}"'}).scalar() is not None


def _delete_in_batches(engine: Engine, table: str, where: str, params: Dict[str, Any],
                       on_batch: Callable[[], None]) -> int:
    """DELETE matching rows BATCH_SIZE at a time, one short transaction each.

    ``table`` and ``where`` come from this module only (never user input);
    values always go through bound ``params``.
    """
    if not _table_exists(engine, table):
        return 0
    sql = text(f"""
        DELETE FROM "{table}" WHERE ctid = ANY(ARRAY(
            SELECT ctid FROM "{table}" WHERE {where} LIMIT :batch
        ))
    """)
    total = 0
    while True:
        with engine.begin() as conn:
            n = conn.execute(sql, {**params, "batch": BATCH_SIZE}).rowcount or 0
        total += n
        on_batch()
        if n < BATCH_SIZE:
            return total


def _select_ids(engine: Engine, table: str, id_col: str, where: str, params: Dict[str, Any]) -> List[Any]:
    """Fetch every matching id in one scan, so the deletes that follow hit the
    primary key instead of re-scanning an unindexed name column per batch."""
    if not _table_exists(engine, table):
        return []
    with engine.connect() as conn:
        return [r[0] for r in conn.execute(text(f'SELECT {id_col} FROM "{table}" WHERE {where}'), params)]


def _chunks(seq: Sequence[Any], size: int):
    for i in range(0, len(seq), size):
        yield list(seq[i:i + size])


def _delete_by_parent_ids(engine: Engine, parent_ids: Sequence[Any], children: Sequence[tuple],
                          parent: Optional[tuple], on_batch: Callable[[], None],
                          counts: Optional[Dict[str, int]] = None) -> Dict[str, int]:
    """For each chunk of parent ids: delete child rows, then the parents.

    children: [(table, fk_column)], parent: (table, id_column) or None.
    Adds into ``counts`` when given, since a child table can sit under two
    parents (documents_doc_groups).
    """
    counts = {} if counts is None else counts
    present_children = [(t, c) for t, c in children if _table_exists(engine, t)]
    parent_present = parent is not None and _table_exists(engine, parent[0])
    for chunk in _chunks(parent_ids, BATCH_SIZE):
        with engine.begin() as conn:
            for table, fk in present_children:
                n = conn.execute(text(f'DELETE FROM "{table}" WHERE {fk} = ANY(:ids)'), {"ids": chunk}).rowcount
                counts[table] = counts.get(table, 0) + (n or 0)
            if parent_present:
                table, id_col = parent
                n = conn.execute(text(f'DELETE FROM "{table}" WHERE {id_col} = ANY(:ids)'), {"ids": chunk}).rowcount
                counts[table] = counts.get(table, 0) + (n or 0)
        on_batch()
    return counts


# ── Default (host) clients ───────────────────────────────────────────────


def _default_s3():
    """Same construction as Ingest's default S3 client."""
    kwargs: Dict[str, Any] = {"endpoint_url": os.getenv('MINIO_URL') or None,
                              "config": Config(s3={'addressing_style': 'path'}, retries={'max_attempts': 10})}
    key, secret = os.getenv('AWS_ACCESS_KEY_ID'), os.getenv('AWS_SECRET_ACCESS_KEY')
    if key and secret:
        kwargs.update(aws_access_key_id=key, aws_secret_access_key=secret)
    return boto3.session.Session().client('s3', **kwargs)


def _default_qdrant() -> Optional[tuple]:
    url, collection = os.getenv('QDRANT_URL'), os.getenv('QDRANT_COLLECTION_NAME')
    if not url or not collection:
        return None
    return QdrantClient(url=url, api_key=os.getenv('QDRANT_API_KEY'), timeout=60), collection


# ── Purge ────────────────────────────────────────────────────────────────


class ProjectPurger:
    """Runs one deletion job. Construct per job; not thread-safe."""

    def __init__(self, host_db: SQLAlchemyIngestDB, resolver: Optional[WorkerConnectionResolver] = None,
                 s3_factory: Callable[[], Any] = _default_s3,
                 qdrant_factory: Callable[[], Optional[tuple]] = _default_qdrant):
        self.host = host_db.engine
        self.resolver = resolver or WorkerConnectionResolver(host_db)
        self.s3_factory = s3_factory
        self.qdrant_factory = qdrant_factory

    # ── entry point ──

    def run(self, deletion_id: int) -> str:
        """Purge one job. Returns 'completed', 'failed', or 'skipped' (already
        completed, or owned by another worker). Never raises: failures are
        recorded on the row."""
        job = claim_deletion(self.host, deletion_id)
        if job is None:
            logger.info("Deletion %s not claimable (completed or owned by another worker)", deletion_id)
            return "skipped"

        self.job_id = job["id"]
        self.name = job["project_name"]
        self.progress: Dict[str, Any] = dict(job["progress"] or {})
        # Resolve external connections before anything is deleted: the
        # project_external_connections row cascades away with the projects row.
        self.resolved = self.resolver.resolve(self.name) if job["include_external"] else ResolvedConnections()
        logger.info("Purging project %r (deletion %s, attempt %s, include_external=%s)",
                    self.name, self.job_id, job["attempts"], job["include_external"])

        try:
            for step, fn in self._steps():
                if self.progress.get(step, {}).get("done"):
                    continue
                result = fn()
                self.progress[step] = {"done": True, "deleted": result}
                self._save_progress()
                logger.info("Deletion %s: %s done (%s)", self.job_id, step, result)
        except Exception as e:  # pylint: disable=broad-except
            logger.exception("Deletion %s failed", self.job_id)
            _update_deletion(self.host, self.job_id,
                             "status = 'failed', error = :err, progress = CAST(:p AS jsonb), heartbeat_at = now()",
                             {"err": f"{type(e).__name__}: {e}"[:2000], "p": json.dumps(self.progress)})
            return "failed"

        _update_deletion(self.host, self.job_id,
                         "status = 'completed', completed_at = now(), heartbeat_at = now()", {})
        logger.info("Deletion %s of %r completed", self.job_id, self.name)
        return "completed"

    def _steps(self) -> List[tuple]:
        steps = [
            ("drain_ingest", self._drain_ingest),
            ("vectors_host", self._vectors_host),
            ("documents_host", lambda: self._documents(self.host)),
            ("conversations", self._conversations),
            ("misc_tables", self._misc_tables),
            ("s3_host", lambda: self._s3(self.s3_factory(), os.getenv('S3_BUCKET_NAME'))),
        ]
        r = self.resolved
        if r.qdrant_client is not None or r.pgvector_store is not None:
            steps.append(("vectors_external", self._vectors_external))
        if r.documents_sql_engine is not None:
            steps.append(("documents_external", lambda: self._documents(r.documents_sql_engine)))
        if r.s3_client is not None:
            steps.append(("s3_external", lambda: self._s3(r.s3_client, r.s3_bucket_name)))
        steps.append(("finalize", self._finalize))
        return steps

    def _heartbeat(self) -> None:
        _update_deletion(self.host, self.job_id, "heartbeat_at = now()", {})

    def _save_progress(self) -> None:
        _update_deletion(self.host, self.job_id, "progress = CAST(:p AS jsonb), heartbeat_at = now()",
                         {"p": json.dumps(self.progress)})

    def _by_name(self, engine: Engine, table: str, column: str = "course_name") -> int:
        return _delete_in_batches(engine, table, f"{column} = :n", {"n": self.name}, self._heartbeat)

    # ── steps ──

    def _drain_ingest(self) -> int:
        """Wait for ingest jobs already running for this project to finish.

        New jobs are refused (backend /ingest and the worker both check
        is_project_deleting), but one picked up before the deletion started
        could still write chunks after we delete them.
        """
        engines = [self.host] + ([self.resolved.documents_sql_engine] if self.resolved.documents_sql_engine else [])
        deadline = time.monotonic() + DRAIN_TIMEOUT
        for engine in engines:
            if not _table_exists(engine, "documents_in_progress"):
                continue
            while True:
                with engine.connect() as conn:
                    running = conn.execute(
                        text("SELECT count(*) FROM documents_in_progress "
                             "WHERE course_name = :n AND error = 'Attempting ingest'"),
                        {"n": self.name},
                    ).scalar()
                if not running or time.monotonic() >= deadline:
                    if running:
                        logger.warning("Deletion %s: %s ingest job(s) still marked running after %ss; continuing",
                                       self.job_id, running, DRAIN_TIMEOUT)
                    break
                self._heartbeat()
                time.sleep(DRAIN_POLL_SECONDS)
        return 0

    def _vectors_host(self) -> Dict[str, int]:
        counts = {"embeddings": self._by_name(self.host, "embeddings")}
        qdrant = self.qdrant_factory()
        if qdrant is not None:
            client, collection = qdrant
            counts["qdrant_points"] = self._delete_qdrant(client, collection)
        return counts

    def _vectors_external(self) -> Dict[str, int]:
        r = self.resolved
        if r.qdrant_client is not None:
            return {"qdrant_points": self._delete_qdrant(r.qdrant_client, r.qdrant_collection_name)}
        # pgvector_store is only set when database_config is present; its
        # embeddings table lives on the same external engine.
        return {"embeddings": self._by_name(r.documents_sql_engine, "embeddings")}

    def _delete_qdrant(self, client: QdrantClient, collection: str) -> int:
        """Filter delete runs server side, so there is no paging through ids.
        Returns the number of points that matched before the delete."""
        course_filter = qmodels.Filter(must=[
            qmodels.FieldCondition(key="course_name", match=qmodels.MatchValue(value=self.name)),
        ])
        n = client.count(collection_name=collection, count_filter=course_filter, exact=True).count
        client.delete(collection_name=collection,
                      points_selector=qmodels.FilterSelector(filter=course_filter), wait=True)
        return n

    def _documents(self, engine: Engine) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        name = {"n": self.name}

        doc_ids = _select_ids(engine, "documents", "id", "course_name = :n", name)
        _delete_by_parent_ids(engine, doc_ids, [("documents_doc_groups", "document_id")],
                              ("documents", "id"), self._heartbeat, counts)

        group_ids = _select_ids(engine, "doc_groups", "id", "course_name = :n", name)
        _delete_by_parent_ids(engine, group_ids, [("doc_groups_sharing", "doc_group_id"),
                                                  ("documents_doc_groups", "doc_group_id")],
                              ("doc_groups", "id"), self._heartbeat, counts)

        for table in ("documents_failed", "documents_in_progress"):
            counts[table] = self._by_name(engine, table)
        return counts

    def _conversations(self) -> Dict[str, int]:
        conv_ids = _select_ids(self.host, "conversations", "id", "project_name = :n", {"n": self.name})
        counts = _delete_by_parent_ids(self.host, conv_ids, [("messages", "conversation_id")],
                                       ("conversations", "id"), self._heartbeat)
        counts["llm-convo-monitor"] = self._by_name(self.host, "llm-convo-monitor")
        return counts

    def _misc_tables(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        name = {"n": self.name}

        cedar_ids = _select_ids(self.host, "cedar_documents", "document_id",
                                "course_name = :n AND document_id IS NOT NULL", name)
        _delete_by_parent_ids(self.host, cedar_ids, [("cedar_chunks", "document_id"),
                                                     ("cedar_document_metadata", "document_id")],
                              None, self._heartbeat, counts)
        guided_ids = _select_ids(self.host, "llm-guided-docs", "id", "course_name = :n", name)
        _delete_by_parent_ids(self.host, guided_ids, [("llm-guided-contexts", "doc_id"),
                                                      ("llm-guided-sections", "doc_id")],
                              ("llm-guided-docs", "id"), self._heartbeat, counts)

        for table in ("cedar_documents", "cedar_runs", "file_uploads", "uiuc-course-table",
                      "usage_metrics", "course_names"):
            counts[table] = self._by_name(self.host, table)
        counts["project_stats"] = self._by_name(self.host, "project_stats", "project_name")
        # project_connection_audit_log is kept on purpose: it is the audit
        # trail for super-admin changes and outlives the project.
        return counts

    def _s3(self, client, bucket: Optional[str]) -> int:
        if not bucket:
            logger.warning("Deletion %s: no S3 bucket configured; skipping", self.job_id)
            return 0
        prefix = f"courses/{self.name}/"
        deleted = 0
        # Re-listing after a crash is safe: deleted keys simply stop appearing.
        for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=prefix):
            keys = [{"Key": o["Key"]} for o in page.get("Contents") or []]
            for chunk in _chunks(keys, S3_DELETE_CHUNK):
                resp = client.delete_objects(Bucket=bucket, Delete={"Objects": chunk, "Quiet": True})
                errors = resp.get("Errors") or []
                if errors:
                    raise RuntimeError(f"S3 refused {len(errors)} delete(s) under {prefix}, e.g. {errors[0]}")
                deleted += len(chunk)
                self._heartbeat()
        return deleted

    def _finalize(self) -> Dict[str, int]:
        """Last step: drop the remaining project rows. Deleting `projects`
        cascades folders and project_external_connections, and frees the
        name once the job is marked completed.

        First sweep documents and embeddings once more: an ingest that
        outlived the drain timeout could have written rows after their step
        finished, and a future chatbot with the same name would inherit them.
        """
        counts: Dict[str, int] = {}
        engines = [self.host] + ([self.resolved.documents_sql_engine] if self.resolved.documents_sql_engine else [])
        for engine in engines:
            for table in ("embeddings", "documents"):
                counts[f"late_{table}"] = counts.get(f"late_{table}", 0) + self._by_name(engine, table)
        counts["course_metadata"] = self._by_name(self.host, "course_metadata")
        with self.host.begin() as conn:
            counts["projects"] = conn.execute(text("DELETE FROM projects WHERE course_name = :n"),
                                              {"n": self.name}).rowcount or 0
        return counts
