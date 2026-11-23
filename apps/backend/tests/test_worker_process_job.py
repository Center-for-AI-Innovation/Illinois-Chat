"""
Tests for the failure path of ``Worker.process_job`` in ``rabbitmq/worker.py`` (issue #354).

A DB or resolver failure on the first attempt logs one ERROR, republishes the
message with retry_count + 1 and acks; the last attempt logs one ERROR, acks
and does not republish; a message that cannot be parsed is logged and acked.

The last attempt records the discarded job in the database that holds its status
rows: the project's documents database when it has one, else the host one. When
that database cannot be resolved, no row is written and one ERROR says so.
"""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace

import pytest

import worker as worker_module


class FakeChannel:

    def __init__(self):
        self.published = []
        self.acked = []

    def basic_publish(self, exchange, routing_key, properties, body):
        self.published.append(json.loads(body))

    def basic_ack(self, delivery_tag):
        self.acked.append(delivery_tag)


class FailingResolver:
    """resolve() fails each time. The documents database alone resolves to
    `documents_engine`: None is the host database, an exception is a failure."""

    documents_engine = None

    def resolve(self, course_name):
        raise RuntimeError("database unreachable")

    def resolve_documents_engine(self, course_name):
        if isinstance(self.documents_engine, Exception):
            raise self.documents_engine
        return self.documents_engine


class FakeStatusDB:

    def __init__(self, engine=None):
        self.engine = engine
        self.failed = []
        self.deleted = []

    def insert_failed_document(self, payload):
        self.failed.append(payload)

    def delete_document_in_progress(self, job_id):
        self.deleted.append(job_id)


@pytest.fixture
def worker():
    w = worker_module.Worker.__new__(worker_module.Worker)  # skip connect()
    w.rabbitmq_queue = "test-queue"
    w.resolver = FailingResolver()
    w.sql_session = None
    return w


def body(retry_count):
    return json.dumps({
        "job_id": "job-1",
        "request_id": "rid-1",
        "retry_count": retry_count,
        "inputs": {"course_name": "ece120", "readable_filename": "a.pdf", "s3_paths": ["courses/ece120/a.pdf"]},
    }).encode()


def errors(caplog):
    return [r for r in caplog.records if r.levelno >= logging.ERROR]


METHOD = SimpleNamespace(delivery_tag=7)
HEADER = SimpleNamespace(reply_to=None)


def test_first_attempt_logs_error_republishes_and_acks(worker, caplog):
    caplog.set_level(logging.DEBUG)
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    attempts = worker_module.MAX_JOB_RETRIES + 1
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed before ingest (DB or connection resolve), attempt 1/%d" % attempts]
    assert errors(caplog)[0].exc_info is not None
    assert [m["retry_count"] for m in channel.published] == [1]
    assert channel.acked == [7]


def test_last_attempt_discards_and_acks(worker, caplog):
    caplog.set_level(logging.DEBUG)
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    attempts = worker_module.MAX_JOB_RETRIES + 1
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed before ingest (DB or connection resolve), discarded after %d attempts" % attempts]
    assert channel.published == []
    assert channel.acked == [7]


def test_discarded_job_is_recorded_in_the_host_database(worker):
    worker.sql_session = FakeStatusDB()
    worker.process_job(FakeChannel(), METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    assert worker.sql_session.deleted == ["job-1"]
    [failed] = worker.sql_session.failed
    assert failed["course_name"] == "ece120"
    assert failed["error"] == ("Job discarded after %d attempts: RuntimeError: database unreachable" %
                               (worker_module.MAX_JOB_RETRIES + 1))


def test_discarded_job_is_recorded_in_the_project_documents_database(worker, monkeypatch):
    project_dbs = []

    def project_db(engine=None):
        project_dbs.append(FakeStatusDB(engine))
        return project_dbs[-1]

    monkeypatch.setattr(worker_module, "SQLAlchemyIngestDB", project_db)
    worker.sql_session = FakeStatusDB()
    worker.resolver.documents_engine = "project-engine"
    worker.process_job(FakeChannel(), METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    # The rows are where the producer wrote them, not in the host database.
    assert [db.engine for db in project_dbs] == ["project-engine"]
    assert project_dbs[0].deleted == ["job-1"]
    assert len(project_dbs[0].failed) == 1
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []


def test_discarded_job_writes_no_row_when_its_database_cannot_be_resolved(worker, caplog):
    caplog.set_level(logging.DEBUG)
    worker.sql_session = FakeStatusDB()
    worker.resolver.documents_engine = RuntimeError("could not translate host name db.internal.example.edu")
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []
    messages = [r.getMessage() for r in errors(caplog)]
    assert messages[1] == ("discarded job not recorded: the documents database of course=ece120 could not be "
                           "resolved (RuntimeError); its documents_in_progress row stays, so the file shows as "
                           "ingesting")
    assert "db.internal.example.edu" not in messages[1]
    assert channel.acked == [7]


def test_unparseable_message_is_logged_and_acked(worker, caplog):
    caplog.set_level(logging.DEBUG)
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, b"not json")
    messages = [r.getMessage() for r in errors(caplog)]
    assert len(messages) == 1
    assert messages[0].startswith("discarding unparseable message (JSONDecodeError: ")
    assert messages[0].endswith(" bytes=8")
    assert "not json" not in messages[0]
    assert channel.published == []
    assert channel.acked == [7]


def test_message_without_job_id_logs_its_keys_not_its_content(worker, caplog):
    caplog.set_level(logging.DEBUG)
    channel = FakeChannel()
    secret = "the whole crawled document text"
    message = json.dumps({"inputs": {"course_name": "ece120", "content": secret}}).encode()
    worker.process_job(channel, METHOD, HEADER, message)
    messages = [r.getMessage() for r in errors(caplog)]
    assert messages == ["discarding unparseable message (KeyError: 'job_id') keys=['inputs']"]
    assert secret not in caplog.text
    assert channel.published == []
    assert channel.acked == [7]
