"""
The /getTopContexts failure path returns a short error string to the client
(HTTP 200, existing contract) and logs the traceback on the server only.

The service is built with ``object.__new__`` so the heavy ``__init__`` never runs.
"""

from __future__ import annotations

import asyncio
import logging
from unittest.mock import MagicMock

from ai_ta_backend.service import retrieval_service
from ai_ta_backend.service.retrieval_service import RetrievalService


class FakeProgrammingError(Exception):
    pass


def _build_failing_service(exc: Exception | None = None) -> RetrievalService:
    svc = object.__new__(RetrievalService)
    svc.sentry = MagicMock()
    svc.posthog = MagicMock()
    conn_manager = MagicMock()
    conn_manager.get_documents_sql_db.side_effect = exc or FakeProgrammingError(
        'relation "documents" does not exist'
    )
    svc.conn_manager = conn_manager
    return svc


def test_get_top_contexts_failure_returns_short_error_without_traceback(caplog):
    svc = _build_failing_service()

    with caplog.at_level(logging.DEBUG, logger=retrieval_service.logger.name):
        result = asyncio.run(
            svc.getTopContexts(
                search_query="what is a binary tree",
                course_name="no-such-course",
                conversation_id="conv-1",
            )
        )

    assert isinstance(result, str)
    assert result == (
        "ERROR: In /getTopContexts. Course: no-such-course. "
        'FakeProgrammingError: relation "documents" does not exist'
    )
    assert "Traceback" not in result
    assert 'File "' not in result
    assert ".py" not in result

    errors = [
        r
        for r in caplog.records
        if r.name == retrieval_service.logger.name and r.levelno == logging.ERROR
    ]
    assert len(errors) == 1
    record = errors[0]
    assert record.exc_info is not None
    assert record.exc_info[0] is FakeProgrammingError
    assert "getTopContexts failed course=no-such-course" in record.getMessage()

    svc.sentry.capture_exception.assert_called_once()


def test_get_top_contexts_failure_sends_only_first_line_capped():
    # Shaped like a SQLAlchemy error: later lines carry SQL and bound parameters.
    exc = FakeProgrammingError(
        "can't adapt type 'dict' " + "x" * 400
        + "\n[SQL: SELECT * FROM project_external_connections WHERE project_name = %(p)s]"
        + "\n[parameters: {'p': 'secret-value'}]"
    )
    svc = _build_failing_service(exc)

    result = asyncio.run(
        svc.getTopContexts(search_query="q", course_name="demo", conversation_id="c")
    )

    prefix = "ERROR: In /getTopContexts. Course: demo. FakeProgrammingError: "
    assert result.startswith(prefix + "can't adapt type 'dict' ")
    assert "\n" not in result
    assert "[SQL:" not in result
    assert "secret-value" not in result
    assert len(result) == len(prefix) + 300


def test_connection_error_body_hides_the_database_host():
    import sqlalchemy.exc

    exc = sqlalchemy.exc.OperationalError(
        "SELECT 1",
        {},
        Exception('could not translate host name "db-internal.example.rds.amazonaws.com" to address'),
    )
    svc = _build_failing_service(exc)

    result = asyncio.run(
        svc.getTopContexts(search_query="q", course_name="demo", conversation_id="c")
    )

    assert result == "ERROR: In /getTopContexts. Course: demo. OperationalError: database connection failed"
    assert "rds.amazonaws.com" not in result


def test_raw_psycopg2_connection_error_body_hides_the_database_host():
    import psycopg2

    exc = psycopg2.OperationalError(
        'connection to server at "db-internal.example.rds.amazonaws.com" (10.0.1.5), port 5432 failed: Connection refused'
    )
    svc = _build_failing_service(exc)

    result = asyncio.run(
        svc.getTopContexts(search_query="q", course_name="demo", conversation_id="c")
    )

    assert result == "ERROR: In /getTopContexts. Course: demo. OperationalError: database connection failed"
    assert "rds.amazonaws.com" not in result
