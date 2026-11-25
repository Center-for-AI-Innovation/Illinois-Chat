"""
Tests for the producers of ingest jobs when a project's stored connection
cannot be used.

Every producer (the backend's ``/ingest`` and ``/canvas_ingest``, the crawler
bridge's ``/ingest``) queues through ``Queue.addJobToIngestQueue``, which
resolves the project's connections before it writes the in-progress row and
publishes. A broken connection therefore fails the request: no row, no message,
and a reply that carries neither the field nor any part of the config. The
traceback in the log names the project and the field, never the config.

The resolver here is the real one on a real encrypted blob that cannot be
decrypted; only the host row read and the AMQP connection are fakes.
"""

from __future__ import annotations

import json
import logging

import pytest

from ai_ta_backend import main
from ai_ta_backend.rabbitmq import bridge, connection_resolver as cr, rmqueue
from ai_ta_backend.utils.crypto import encrypt

PROJECT = "ext"
KEY = "MARKER-key"
# Planted in the stored config: it must never reach a reply or a log record.
MARKER = "MARKER-secret"
LAST_LINE = ("ai_ta_backend.rabbitmq.connection_resolver.ConnectionConfigError: the connection database_config of "
             "project ext cannot be used (InvalidTag)")


class _SqlStub:

    def __init__(self, rows):
        self._rows = rows

    def getExternalConnection(self, project_name):
        return self._rows.get(project_name)


class _HostDB:
    """The host status database: records every write."""

    def __init__(self):
        self.writes = []

    def insert_document_in_progress(self, payload):
        self.writes.append(payload)
        return {"beam_task_id": "job-1"}

    def delete_document_in_progress(self, job_id):
        self.writes.append(("delete", job_id))


class _Channel:

    def __init__(self, published):
        self.is_open = True
        self._published = published

    def basic_publish(self, **kwargs):
        self._published.append(kwargs)

    def close(self):
        pass


class _Connection:
    is_open = True

    def close(self):
        pass


def corrupted_envelope():
    """A real envelope whose ciphertext was changed, so it cannot be decrypted."""
    config = {"connection_uri": "postgresql://ext:" + MARKER + "@db.example.edu:5432/docs"}
    version, body, iv = encrypt(json.dumps(config), KEY).split(".")
    body = ("A" if body[0] != "A" else "B") + body[1:]
    return {"encrypted": ".".join([version, body, iv])}


@pytest.fixture
def broken(monkeypatch):
    """`ext` has a database_config that cannot be decrypted. Returns the host writes and the publishes."""
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY", KEY)
    host = _HostDB()
    published = []
    monkeypatch.setattr(rmqueue, "sql_session", host)
    monkeypatch.setattr(rmqueue, "resolver",
                        cr.WorkerConnectionResolver(_SqlStub({PROJECT: {"database_config": corrupted_envelope()}})))

    def connect(self):
        self.connection = _Connection()
        self.channel = _Channel(published)

    monkeypatch.setattr(rmqueue.Queue, "connect", connect)
    return host.writes, published


def errors(caplog):
    return [r for r in caplog.records if r.levelno >= logging.ERROR]


def last_traceback_line(record):
    return logging.Formatter().formatException(record.exc_info).strip().splitlines()[-1]


def test_queue_writes_no_row_and_publishes_nothing(broken):
    writes, published = broken
    with pytest.raises(cr.ConnectionConfigError) as raised:
        rmqueue.Queue().addJobToIngestQueue({"course_name": PROJECT, "readable_filename": "a.txt", "s3_paths": ["k"]})
    assert (raised.value.project_name, raised.value.field) == (PROJECT, "database_config")
    assert writes == [] and published == []


def test_backend_ingest_is_a_generic_500(broken, caplog):
    writes, published = broken
    caplog.set_level(logging.DEBUG)
    response = main.app.test_client().post("/ingest", json={"course_name": PROJECT, "readable_filename": "a.txt",
                                                             "s3_paths": ["k"]})
    body = response.get_data(as_text=True)
    assert response.status_code == 500
    assert "database_config" not in body and MARKER not in body and "ConnectionConfigError" not in body
    assert writes == [] and published == []
    # Flask's own record of the unhandled error, once; its traceback ends on the project and the field.
    assert [r.getMessage() for r in errors(caplog)] == ["Exception on /ingest [POST]"]
    assert last_traceback_line(errors(caplog)[0]) == LAST_LINE
    assert MARKER not in caplog.text


def test_bridge_ingest_answers_with_the_type_only(broken, monkeypatch, caplog):
    writes, published = broken
    monkeypatch.setattr(bridge, "INGEST_API_KEY", None)
    caplog.set_level(logging.DEBUG)
    response = bridge.app.test_client().post("/ingest", json={"course_name": PROJECT, "content": "x"})
    assert response.status_code == 500
    assert response.get_json() == {"error": "Failed to queue ingest job: ConnectionConfigError"}
    assert writes == [] and published == []
    assert [r.getMessage() for r in errors(caplog)] == ["Failed to queue ingest job"]
    assert last_traceback_line(errors(caplog)[0]) == LAST_LINE
    assert MARKER not in caplog.text


def test_canvas_ingest_answers_with_the_type_only(broken, monkeypatch, caplog):
    writes, published = broken

    class QueuesOneFile:
        """Stands in for the Canvas download and S3 upload; queues the way ingest_course_content does."""

        def auto_accept_enrollments(self, canvas_course_id):
            pass

        def ingest_course_content(self, canvas_course_id, course_name, content_ingest_dict):
            job_id = rmqueue.Queue().addJobToIngestQueue({"course_name": course_name, "readable_filename": "a.pdf",
                                                          "s3_paths": ["courses/ext/a.pdf"]})
            return [job_id], {"files": "Success"}

    monkeypatch.setenv("CANVAS_ACCESS_TOKEN", "token")
    monkeypatch.setattr(main, "IngestCanvas", QueuesOneFile)
    caplog.set_level(logging.DEBUG)
    response = main.app.test_client().post("/canvas_ingest", json={
        "course_name": PROJECT, "canvas_url": "https://canvas.illinois.edu/courses/123", "files": "true"})
    assert response.status_code == 500
    assert response.get_json() == {"error": "Canvas ingest failed: ConnectionConfigError",
                                   "message": "Internal Server Error: ConnectionConfigError"}
    assert writes == [] and published == []
    assert [r.getMessage() for r in errors(caplog)] == ["canvas ingest failed course=ext"]
    assert last_traceback_line(errors(caplog)[0]) == LAST_LINE
    assert MARKER not in caplog.text
