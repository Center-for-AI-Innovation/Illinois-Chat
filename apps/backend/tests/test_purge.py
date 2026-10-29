"""
Live tests for the background chatbot purge (ai_ta_backend/rabbitmq/purge.py).

Skipped unless ``TEST_POSTGRES_URI`` is set. The URI only needs rights to
CREATE/DROP DATABASE: each test run creates two throwaway databases (a host
DB and a stand-in for a project's external DB) from infra/db/init-schema.sql
and drops them afterwards, so no existing data is touched.

Coverage:
  - only the deleted project's rows go; other projects and the
    connection audit log stay; the projects row goes last
  - batching (BATCH_SIZE shrunk to force several batches per table)
  - external stores purged only when include_external is set
  - a failed step leaves status 'failed' and a retry resumes after the
    last finished step; finalize sweeps documents written late
  - job claiming: completed and live-leased jobs are not claimable,
    stale leases are
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

PG_URI = os.environ.get("TEST_POSTGRES_URI")
pytestmark = pytest.mark.skipif(not PG_URI, reason="TEST_POSTGRES_URI not set; skipping live purge tests")

INIT_SCHEMA = Path(__file__).resolve().parents[3] / "infra" / "db" / "init-schema.sql"
BOT, OTHER = "bot", "other-bot"


def _create_db(admin, name: str):
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    engine = create_engine(make_url(PG_URI).set(database=name), poolclass=NullPool)
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute(INIT_SCHEMA.read_text())
            # course_metadata (migration 0011) is not part of init-schema.sql;
            # this is its shape minus the columns nothing here reads.
            cur.execute("CREATE TABLE course_metadata (course_name text PRIMARY KEY, "
                        "tags jsonb DEFAULT '[]'::jsonb NOT NULL, raw_metadata jsonb DEFAULT '{}'::jsonb NOT NULL)")
        raw.commit()
    finally:
        raw.close()
    return engine


@pytest.fixture
def dbs():
    admin = create_engine(PG_URI, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    suffix = uuid.uuid4().hex[:8]
    names = [f"purge_test_host_{suffix}", f"purge_test_ext_{suffix}"]
    engines = [_create_db(admin, n) for n in names]
    try:
        yield engines
    finally:
        for e in engines:
            e.dispose()
        with admin.connect() as conn:
            for n in names:
                conn.execute(text(f'DROP DATABASE IF EXISTS "{n}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture
def purge(monkeypatch):
    from ai_ta_backend.rabbitmq import purge as mod

    monkeypatch.setattr(mod, "BATCH_SIZE", 3)  # several batches per table
    monkeypatch.setattr(mod, "DRAIN_TIMEOUT", 0)
    return mod


def seed_documents(engine, course: str, n_docs: int = 7):
    with engine.begin() as conn:
        group_id = conn.execute(
            text("INSERT INTO doc_groups (name, course_name) VALUES ('g', :c) RETURNING id"), {"c": course}).scalar()
        conn.execute(text("INSERT INTO doc_groups_sharing (doc_group_id) VALUES (:g)"), {"g": group_id})
        for i in range(n_docs):
            doc_id = conn.execute(
                text("INSERT INTO documents (course_name, s3_path) VALUES (:c, :p) RETURNING id"),
                {"c": course, "p": f"courses/{course}/{i}.pdf"}).scalar()
            conn.execute(text("INSERT INTO documents_doc_groups (document_id, doc_group_id) VALUES (:d, :g)"),
                         {"d": doc_id, "g": group_id})
            conn.execute(
                text("INSERT INTO embeddings (course_name, embedding) "
                     "VALUES (:c, array_fill(0, ARRAY[4096])::vector)"), {"c": course})
        conn.execute(text("INSERT INTO documents_failed (course_name) VALUES (:c)"), {"c": course})
        conn.execute(text("INSERT INTO documents_in_progress (course_name) VALUES (:c)"), {"c": course})


def seed_host(engine, course: str):
    seed_documents(engine, course)
    with engine.begin() as conn:
        project_id = conn.execute(
            text("INSERT INTO projects (course_name) VALUES (:c) RETURNING id"), {"c": course}).scalar()
        conn.execute(text("INSERT INTO folders (id, name, user_email, project_id) VALUES (gen_random_uuid(), 'f', 'u@x.edu', :p)"),
                     {"p": project_id})
        conn.execute(text("INSERT INTO course_metadata (course_name) VALUES (:c)"), {"c": course})
        conn.execute(text("INSERT INTO project_connection_audit_log (actor_email, action, outcome, project_name) "
                          "VALUES ('root@x.edu', 'upsert', 'success', :c)"), {"c": course})
        for _ in range(5):
            conv = conn.execute(
                text("INSERT INTO conversations (name, model, prompt, temperature, project_name) "
                     "VALUES ('c', 'm', 'p', 0.1, :c) RETURNING id"), {"c": course}).scalar()
            for _ in range(2):
                conn.execute(text("INSERT INTO messages (id, conversation_id, role, created_at, content_text) "
                                  "VALUES (gen_random_uuid(), :v, 'user', now(), 'hi')"), {"v": conv})
        guided = conn.execute(text('INSERT INTO "llm-guided-docs" (course_name) VALUES (:c) RETURNING id'),
                              {"c": course}).scalar()
        conn.execute(text('INSERT INTO "llm-guided-sections" (doc_id) VALUES (:d)'), {"d": guided})


def new_deletion(engine, course: str, include_external: bool = False) -> int:
    with engine.begin() as conn:
        return conn.execute(
            text("INSERT INTO project_deletions (project_name, requested_by, include_external) "
                 "VALUES (:c, 'owner@x.edu', :e) RETURNING id"), {"c": course, "e": include_external}).scalar()


def count(engine, sql: str, **params) -> int:
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar()


def deletion_row(engine, deletion_id: int):
    with engine.connect() as conn:
        return conn.execute(text("SELECT * FROM project_deletions WHERE id = :i"), {"i": deletion_id}).mappings().one()


class FakeS3:
    def __init__(self, keys, fail_times: int = 0):
        self.keys = set(keys)
        self.fail_times = fail_times
        self.delete_calls = 0

    def get_paginator(self, _name):
        s3 = self

        class Paginator:
            def paginate(self, Bucket, Prefix):
                matching = sorted(k for k in s3.keys if k.startswith(Prefix))
                for i in range(0, len(matching), 2):  # tiny pages
                    yield {"Contents": [{"Key": k} for k in matching[i:i + 2]]}

        return Paginator()

    def delete_objects(self, Bucket, Delete):
        self.delete_calls += 1
        if self.fail_times:
            self.fail_times -= 1
            raise RuntimeError("s3 unavailable")
        for obj in Delete["Objects"]:
            self.keys.discard(obj["Key"])
        return {}


def make_purger(purge, host, s3, resolved=None):
    resolver = MagicMock()
    resolver.resolve.return_value = resolved or purge.ResolvedConnections()
    return purge.ProjectPurger(SimpleNamespace(engine=host), resolver=resolver,
                               s3_factory=lambda: s3, qdrant_factory=lambda: None), resolver


def test_purges_only_the_deleted_project(dbs, purge, monkeypatch):
    host, _ = dbs
    monkeypatch.setenv("S3_BUCKET_NAME", "host-bucket")
    seed_host(host, BOT)
    seed_host(host, OTHER)
    s3 = FakeS3([f"courses/{BOT}/a.pdf", f"courses/{BOT}/b.pdf", f"courses/{BOT}/c.pdf", f"courses/{OTHER}/a.pdf"])
    deletion_id = new_deletion(host, BOT)
    assert purge.is_project_deleting(host, BOT)

    purger, resolver = make_purger(purge, host, s3)
    assert purger.run(deletion_id) == "completed"

    resolver.resolve.assert_not_called()  # include_external=False
    for table, col in [("documents", "course_name"), ("embeddings", "course_name"), ("doc_groups", "course_name"),
                       ("documents_failed", "course_name"), ("documents_in_progress", "course_name"),
                       ("conversations", "project_name"), ("course_metadata", "course_name"),
                       ("projects", "course_name"), ('"llm-guided-docs"', "course_name")]:
        assert count(host, f"SELECT count(*) FROM {table} WHERE {col} = :c", c=BOT) == 0, table
        assert count(host, f"SELECT count(*) FROM {table} WHERE {col} = :c", c=OTHER) > 0, table
    # Children of deleted parents are gone; the other project's are intact.
    assert count(host, "SELECT count(*) FROM messages") == 10
    assert count(host, "SELECT count(*) FROM documents_doc_groups") == 7
    assert count(host, "SELECT count(*) FROM doc_groups_sharing") == 1
    assert count(host, 'SELECT count(*) FROM "llm-guided-sections"') == 1
    assert count(host, "SELECT count(*) FROM folders") == 1  # cascaded with projects
    # The audit trail outlives the project.
    assert count(host, "SELECT count(*) FROM project_connection_audit_log WHERE project_name = :c", c=BOT) == 1
    assert s3.keys == {f"courses/{OTHER}/a.pdf"}

    row = deletion_row(host, deletion_id)
    assert row["status"] == "completed" and row["completed_at"] is not None
    assert row["progress"]["documents_host"]["deleted"]["documents"] == 7
    assert row["progress"]["documents_host"]["deleted"]["documents_doc_groups"] == 7
    assert row["progress"]["conversations"]["deleted"]["messages"] == 10
    assert not purge.is_project_deleting(host, BOT)


def test_external_stores_purged_only_when_opted_in(dbs, purge, monkeypatch):
    host, ext = dbs
    monkeypatch.setenv("S3_BUCKET_NAME", "host-bucket")
    resolved = purge.ResolvedConnections(documents_sql_engine=ext, pgvector_store=object())

    # Not opted in: external data is left alone, host is still purged.
    seed_host(host, BOT)
    seed_documents(ext, BOT)
    ext_s3 = FakeS3([f"courses/{BOT}/x.pdf"])
    resolved.s3_client, resolved.s3_bucket_name = ext_s3, "ext-bucket"
    purger, resolver = make_purger(purge, host, FakeS3([]), resolved)
    assert purger.run(new_deletion(host, BOT, include_external=False)) == "completed"
    resolver.resolve.assert_not_called()
    assert count(host, "SELECT count(*) FROM documents WHERE course_name = :c", c=BOT) == 0
    assert count(ext, "SELECT count(*) FROM documents WHERE course_name = :c", c=BOT) == 7
    assert ext_s3.keys == {f"courses/{BOT}/x.pdf"}

    # Opted in: external documents, embeddings and files go too.
    seed_host(host, BOT)
    purger, resolver = make_purger(purge, host, FakeS3([]), resolved)
    assert purger.run(new_deletion(host, BOT, include_external=True)) == "completed"
    resolver.resolve.assert_called_once_with(BOT)
    for table in ("documents", "embeddings", "doc_groups", "documents_failed"):
        assert count(ext, f"SELECT count(*) FROM {table} WHERE course_name = :c", c=BOT) == 0, table
    assert count(ext, "SELECT count(*) FROM documents_doc_groups") == 0
    assert ext_s3.keys == set()


def test_failed_step_is_recorded_and_retry_resumes(dbs, purge, monkeypatch):
    host, _ = dbs
    monkeypatch.setenv("S3_BUCKET_NAME", "host-bucket")
    seed_host(host, BOT)
    s3 = FakeS3([f"courses/{BOT}/a.pdf"], fail_times=1)
    deletion_id = new_deletion(host, BOT)
    purger, _ = make_purger(purge, host, s3)

    assert purger.run(deletion_id) == "failed"
    row = deletion_row(host, deletion_id)
    assert row["status"] == "failed"
    assert "s3 unavailable" in row["error"]
    assert row["progress"]["documents_host"]["done"] is True
    assert "s3_host" not in row["progress"]
    # The name stays reserved and the projects row survives a failure.
    assert purge.is_project_deleting(host, BOT)
    assert count(host, "SELECT count(*) FROM projects WHERE course_name = :c", c=BOT) == 1

    # A document written after its step finished (e.g. a late ingest) is
    # caught by finalize's sweep even though documents_host is skipped.
    with host.begin() as conn:
        conn.execute(text("INSERT INTO documents (course_name) VALUES (:c)"), {"c": BOT})

    purger, _ = make_purger(purge, host, s3)
    assert purger.run(deletion_id) == "completed"
    row = deletion_row(host, deletion_id)
    assert row["attempts"] == 2 and row["error"] is None
    assert s3.keys == set()
    assert count(host, "SELECT count(*) FROM documents WHERE course_name = :c", c=BOT) == 0
    assert row["progress"]["documents_host"]["deleted"]["documents"] == 7  # not re-run
    assert row["progress"]["finalize"]["deleted"]["late_documents"] == 1


def test_claiming(dbs, purge):
    host, _ = dbs
    deletion_id = new_deletion(host, BOT)

    assert purge.claim_deletion(host, deletion_id)["project_name"] == BOT
    # Running with a live heartbeat: owned by someone else.
    assert purge.claim_deletion(host, deletion_id) is None
    assert purge.find_resumable_deletions(host) == []

    with host.begin() as conn:
        conn.execute(text("UPDATE project_deletions SET heartbeat_at = now() - interval '1 hour' WHERE id = :i"),
                     {"i": deletion_id})
    assert purge.find_resumable_deletions(host) == [deletion_id]
    assert purge.claim_deletion(host, deletion_id)["attempts"] == 2

    with host.begin() as conn:
        conn.execute(text("UPDATE project_deletions SET status = 'completed' WHERE id = :i"), {"i": deletion_id})
    assert purge.claim_deletion(host, deletion_id) is None
    # A completed deletion frees the name for a new one.
    assert new_deletion(host, BOT) > deletion_id
