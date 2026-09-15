"""
Routing tests for ConnectionManager. Pure unit tests — no live Postgres / Qdrant.

We bypass the heavy default constructor by allocating ConnectionManager with
``object.__new__`` and wiring only the fields the routing decisions actually
touch. Decryption is short-circuited by patching ``decrypt_config`` to be an
identity function so the rows can carry plain dicts directly.

Cases (driven by the table in §13 of the dual-engine plan):

  no override                  -> pgvector, host pg engine
  qdrant_config only           -> qdrant
  database_config only         -> pgvector, per-project pg engine
  qdrant_config + database     -> qdrant (vector); per-project pg engine
                                  still used for documents SQL

Plus the no-cache guarantee from issue #228: every call re-reads the row, so a
connection edit is visible to the very next call.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy.pool import NullPool

from ai_ta_backend.database import connection_manager as cm


PROJECT = "demo"


def _build_manager(rows: dict[str, dict | None]):
    """Return a ConnectionManager wired with mock rows and identity decryption.

    ``rows`` maps project_name → external-connection row (or None for no row).
    Mutating ``rows`` between calls simulates a config edit.
    """
    mgr = object.__new__(cm.ConnectionManager)

    # Mock sql_db with a getExternalConnection that hits the rows table.
    class _SqlStub:
        def __init__(self):
            self.reads = 0

        def getExternalConnection(self, project_name):
            self.reads += 1
            return rows.get(project_name)

    mgr._sql_db = _SqlStub()
    mgr._aws = object()
    mgr._default_qdrant_collection = "default-coll"
    mgr._default_s3_bucket = "default-bucket"
    return mgr


@pytest.fixture(autouse=True)
def identity_decrypt(monkeypatch):
    """Treat the encrypted blob's `encrypted` field as the plaintext dict."""

    def _identity(blob):
        if isinstance(blob, dict) and "encrypted" in blob:
            return blob["encrypted"]
        return blob

    monkeypatch.setattr(cm, "decrypt_config", _identity)


def _qdrant_row(**overrides):
    row = {
        "qdrant_config": {
            "encrypted": {
                "url": "https://q.example.com",
                "api_key": "k",
                "port": 6333,
                "default_collection": "c",
            }
        },
        "database_config": None,
        "s3_config": None,
        "embedding_config": None,
    }
    row.update(overrides)
    return row


def _database_row(uri: str = "postgres://u:p@h/db", **overrides):
    row = {
        "qdrant_config": None,
        "database_config": {"encrypted": {"connection_uri": uri}},
        "s3_config": None,
        "embedding_config": None,
    }
    row.update(overrides)
    return row


def test_no_override_routes_to_pgvector_host():
    mgr = _build_manager({PROJECT: None})
    assert mgr.get_vector_engine_kind(PROJECT) == "pgvector"


def test_qdrant_config_only_routes_to_qdrant():
    mgr = _build_manager({PROJECT: _qdrant_row()})
    assert mgr.get_vector_engine_kind(PROJECT) == "qdrant"


def test_database_config_only_routes_to_pgvector():
    mgr = _build_manager({PROJECT: _database_row()})
    assert mgr.get_vector_engine_kind(PROJECT) == "pgvector"

    # The pgvector branch must not use the host store — it builds a
    # per-project store bound to an engine for the row's connection_uri.
    with patch.object(cm, "create_engine") as create_engine_mock:
        engine_sentinel = object()
        create_engine_mock.return_value = engine_sentinel
        with patch(
            "ai_ta_backend.database.vector_store.PgVectorStore"
        ) as PgVecCtor:
            PgVecCtor.return_value = "per-project-store"
            vdb = mgr.get_vector_db(PROJECT)

    assert vdb.pgvector_store == "per-project-store"
    create_engine_mock.assert_called_once()
    # NullPool: the engine lives for one request, so connection reuse is
    # delegated to the external database's own pooler.
    assert create_engine_mock.call_args.kwargs["poolclass"] is NullPool
    # The PgVectorStore should be constructed with the engine kwarg.
    _, kwargs = PgVecCtor.call_args
    assert kwargs.get("engine") is engine_sentinel


def test_qdrant_plus_database_routes_qdrant_for_vector():
    mgr = _build_manager(
        {PROJECT: _qdrant_row(database_config={"encrypted": {"connection_uri": "postgres://u:p@h/db"}})}
    )
    assert mgr.get_vector_engine_kind(PROJECT) == "qdrant"


def test_no_vector_engine_env_branch():
    """Even with VECTOR_ENGINE=qdrant set, no row → pgvector. Env switch is dead."""
    import os
    os.environ["VECTOR_ENGINE"] = "qdrant"
    try:
        mgr = _build_manager({PROJECT: None})
        assert mgr.get_vector_engine_kind(PROJECT) == "pgvector"
    finally:
        os.environ.pop("VECTOR_ENGINE", None)


def test_documents_db_builds_a_fresh_engine_per_call():
    """No cache: each call re-reads the row and builds its own engine."""
    mgr = _build_manager({PROJECT: _database_row()})

    with patch.object(cm, "create_engine") as create_engine_mock:
        create_engine_mock.side_effect = [object(), object()]
        first = mgr.get_documents_sql_db(PROJECT)
        second = mgr.get_documents_sql_db(PROJECT)

    assert create_engine_mock.call_count == 2
    assert mgr._sql_db.reads == 2
    assert first is not second


def test_config_edit_is_visible_to_the_next_call():
    """The bug behind issue #228: a changed row must not be served stale."""
    rows: dict[str, dict | None] = {
        PROJECT: {
            "qdrant_config": None,
            "database_config": None,
            "s3_config": {
                "encrypted": {
                    "aws_access_key_id": "k",
                    "aws_secret_access_key": "s",
                    "bucket_name": "bucket-a",
                }
            },
            "embedding_config": None,
        }
    }
    mgr = _build_manager(rows)

    with patch.object(cm.ConnectionManager, "_create_s3", staticmethod(lambda p, c: object())):
        _, bucket = mgr.get_s3_client(PROJECT)
        assert bucket == "bucket-a"

        rows[PROJECT]["s3_config"]["encrypted"]["bucket_name"] = "bucket-b"
        _, bucket = mgr.get_s3_client(PROJECT)
        assert bucket == "bucket-b"

        # A deactivated row reads as absent (getExternalConnection filters on
        # is_active), so the project falls back to the env default bucket.
        rows[PROJECT] = None
        _, bucket = mgr.get_s3_client(PROJECT)
        assert bucket == "default-bucket"
