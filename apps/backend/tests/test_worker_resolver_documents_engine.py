"""
Tests for ``WorkerConnectionResolver.resolve_documents_engine`` and the engine
builders (issue #354).

The worker asks for the documents database alone when ``resolve()`` failed, so
the status rows of a discarded job go to the database where the producer wrote
them. An invalid ``connection_uri`` must not put the string, which holds the
password, into the error text.
"""

from __future__ import annotations

import logging

import pytest

from ai_ta_backend.database import connection_manager
from ai_ta_backend.rabbitmq import connection_resolver as cr

PROJECT = "demo"
SECRET = "p4ssw0rd-in-the-uri"
BAD_URIS = [
    # No "://", so SQLAlchemy cannot parse it and the log mask for "://user:password@" does not match.
    "postgresql+psycopg2 user:" + SECRET + "@db.example.edu/docs",
    # A password with "@" and ":" that is not encoded. SQLAlchemy reads the end of it as the
    # port and raises a plain ValueError that quotes it.
    "postgresql://user:p@ss:" + SECRET + "@db.example.edu:5432/docs",
    "postgresql://user:" + SECRET,
]


class _SqlStub:

    def __init__(self, rows):
        self._rows = rows

    def getExternalConnection(self, project_name):
        return self._rows.get(project_name)


@pytest.fixture(autouse=True)
def identity_decrypt(monkeypatch):
    """Treat the blob's `encrypted` field as the already-decrypted dict."""
    monkeypatch.setattr(cr, "_decrypt_config", lambda blob: blob["encrypted"])


def resolver(row):
    return cr.WorkerConnectionResolver(_SqlStub({PROJECT: row} if row is not None else {}))


def test_project_with_its_own_documents_database_gets_that_engine():
    row = {"database_config": {"encrypted": {"connection_uri": "postgresql+psycopg2://u:p@db.example.edu:5432/docs"}},
           # The other parts of the config are not read: they are what resolve() can fail on.
           "qdrant_config": {"encrypted": {"host": "not-used"}}}
    engine = resolver(row).resolve_documents_engine(PROJECT)
    assert engine.url.host == "db.example.edu" and engine.url.database == "docs"


@pytest.mark.parametrize("row", [None, {}, {"qdrant_config": {"encrypted": {"host": "q"}}}])
def test_project_on_the_host_database_gets_none(row):
    assert resolver(row).resolve_documents_engine(PROJECT) is None


def test_no_project_name_gets_none():
    assert resolver({}).resolve_documents_engine("") is None


BUILDERS = [cr.WorkerConnectionResolver._create_engine, connection_manager.ConnectionManager._create_engine]


@pytest.mark.parametrize("build", BUILDERS)
def test_scheme_that_cannot_be_used_is_named(build, caplog):
    """postgres:// passes the check in the app, and SQLAlchemy 2 does not take it."""
    caplog.set_level(logging.DEBUG)
    with pytest.raises(ValueError) as raised:
        build(PROJECT, {"connection_uri": "postgres://user:" + SECRET + "@db.example.edu:5432/docs"})
    assert str(raised.value) == ("the connection_uri of project demo has the scheme postgres://, which the backend "
                                 "cannot use; use postgresql://")
    assert raised.value.__cause__ is None and raised.value.__suppress_context__


@pytest.mark.parametrize("build", BUILDERS)
@pytest.mark.parametrize("bad_uri", BAD_URIS)
def test_invalid_connection_uri_is_not_in_the_error(build, bad_uri, caplog):
    caplog.set_level(logging.DEBUG)
    with pytest.raises(ValueError) as raised:
        build(PROJECT, {"connection_uri": bad_uri})
    assert str(raised.value) == "the connection_uri of project demo is not a valid database URL"
    # SQLAlchemy's own error quotes the whole string. It must not come back as the cause or the context.
    assert raised.value.__cause__ is None and raised.value.__suppress_context__
    logging.getLogger("test").exception("resolve failed", exc_info=raised.value)
    assert SECRET not in caplog.text
