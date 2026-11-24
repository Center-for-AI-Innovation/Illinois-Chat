"""
Tests for the failure paths of ``Worker.process_job`` in ``rabbitmq/worker.py``.

A transient DB or resolver failure on the first attempt logs one ERROR,
republishes the message with retry_count + 1 and acks; the last attempt logs one
ERROR, acks and does not republish; a message that cannot be parsed is logged and
acked. The last attempt records the discarded job in the database that holds its
status rows: the project's documents database when it has one, else the host one.
When that database cannot be resolved, or the insert fails, no row is written, the
in-progress row stays and one ERROR says so.

A stored connection of the project that cannot be used (``ConnectionConfigError``)
ends the job on its first attempt: no republish, one ack, one ERROR record, and a
failed row in the project's documents database, never in the host database for a
project with its own. When the documents database is the broken part, nothing is
written and the ERROR says the in-progress row stays. These tests run the real
resolver on configs encrypted with a test key, with a planted marker that must not
reach any record.
"""

from __future__ import annotations

import json
import logging
import traceback
from types import SimpleNamespace

import pytest

import rmsql
import worker as worker_module
from ai_ta_backend.utils.crypto import encrypt
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool


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
    """rmsql's two writes. Each returns True, or the value or error set on the class
    (rmsql returns False when the database refuses a write)."""

    insert_result = True
    delete_result = True

    def __init__(self, engine=None):
        self.engine = engine
        self.failed = []
        self.deleted = []

    @staticmethod
    def _result(value):
        if isinstance(value, Exception):
            raise value
        return value

    def insert_failed_document(self, payload):
        result = self._result(self.insert_result)
        if result:
            self.failed.append(payload)
        return result

    def delete_document_in_progress(self, job_id):
        result = self._result(self.delete_result)
        if result:
            self.deleted.append(job_id)
        return result


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


DRIVER_HOST = "db.internal.example.edu"


def assert_traceback_only_at_debug(caplog, text=DRIVER_HOST):
    """A write or resolve that raised: its text is in a DEBUG traceback, never in a record above DEBUG."""
    for record in caplog.records:
        if record.levelno > logging.DEBUG:
            assert text not in record.getMessage()
            if record.exc_info:
                assert text not in "".join(traceback.format_exception(*record.exc_info))
    assert any(r.levelno == logging.DEBUG and r.exc_info and text in str(r.exc_info[1]) for r in caplog.records)


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
    # The row names the error type only: the text of a driver error names the host and the user.
    assert failed["error"] == ("Job discarded after %d attempts: the database or the connections of the project "
                               "could not be reached (RuntimeError)" % (worker_module.MAX_JOB_RETRIES + 1))


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


def _status_tables(engine):
    rmsql.models.DocumentsFailed.__table__.create(engine)
    rmsql.models.DocumentsInProgress.__table__.create(engine)


def test_real_status_db_writes_return_true_when_they_work():
    engine = create_engine("sqlite://", poolclass=StaticPool)  # one in-memory database for every session
    _status_tables(engine)
    with engine.begin() as conn:
        # The ids by hand: SQLite numbers only an INTEGER primary key, and these are BIGINT.
        conn.execute(rmsql.models.DocumentsInProgress.__table__.insert().values(id=1, beam_task_id="job-1"))
    db = rmsql.SQLAlchemyIngestDB(engine=engine)
    assert db.insert_failed_document({"id": 1, "course_name": "ece120", "error": "e"}) is True
    assert db.delete_document_in_progress("job-1") is True
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM documents_failed")).scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM documents_in_progress")).scalar() == 0


def test_real_status_db_writes_return_false_when_the_database_refuses(caplog):
    caplog.set_level(logging.DEBUG)
    # No tables: each statement raises OperationalError, a SQLAlchemyError, which rmsql logs and turns into False.
    db = rmsql.SQLAlchemyIngestDB(engine=create_engine("sqlite://", poolclass=StaticPool))
    assert db.insert_failed_document({"course_name": "ece120", "error": "e"}) is False
    assert db.delete_document_in_progress("job-1") is False
    assert [r.getMessage() for r in errors(caplog)] == [
        "insert into documents_failed failed", "delete from documents_in_progress failed"]


def test_discarded_job_keeps_its_in_progress_row_when_the_insert_fails(worker, caplog, monkeypatch):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(FakeStatusDB, "insert_result", False)
    worker.sql_session = FakeStatusDB()
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    # A failed insert followed by a good delete would make the file vanish with no failure.
    assert worker.sql_session.deleted == []
    assert [r.getMessage() for r in errors(caplog)][1:] == [
        "discarded job not recorded: the insert into documents_failed failed; its documents_in_progress row "
        "stays; course=ece120, the host database"]
    assert channel.published == [] and channel.acked == [7]


def test_discarded_job_says_when_its_in_progress_row_could_not_be_removed(worker, caplog, monkeypatch):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(FakeStatusDB, "delete_result", False)
    project_dbs = []
    monkeypatch.setattr(worker_module, "SQLAlchemyIngestDB", lambda engine=None: project_dbs.append(
        FakeStatusDB(engine)) or project_dbs[-1])
    worker.sql_session = FakeStatusDB()
    worker.resolver.documents_engine = "project-engine"
    worker.process_job(FakeChannel(), METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    assert len(project_dbs[0].failed) == 1
    assert [r.getMessage() for r in errors(caplog)][1:] == [
        "discarded job recorded, but its documents_in_progress row could not be removed; course=ece120, the "
        "project's documents database"]


def test_discarded_job_names_a_delete_that_raised(worker, caplog, monkeypatch):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(FakeStatusDB, "delete_result", RuntimeError("could not translate host name " + DRIVER_HOST))
    worker.sql_session = FakeStatusDB()
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(worker_module.MAX_JOB_RETRIES))
    assert channel.published == [] and channel.acked == [7]
    assert len(worker.sql_session.failed) == 1
    assert [r.getMessage() for r in errors(caplog)][1:] == [
        "discarded job recorded, but its documents_in_progress row could not be removed (RuntimeError); "
        "course=ece120, the host database"]
    assert_traceback_only_at_debug(caplog)


# ── A stored connection that cannot be used: one attempt ──

KEY = "MARKER-key"
OTHER_KEY = "MARKER-other-key"
# Planted in every stored config: it must never reach a log record or a failed row.
MARKER = "MARKER-secret"
GOOD = {
    "database_config": {"connection_uri": "postgresql://ext:" + MARKER + "@db.example.edu:5432/docs"},
    "qdrant_config": {"url": "http://127.0.0.1:9", "api_key": MARKER, "port": 6333, "default_collection": "c"},
}
# A config from before the port was stored: the Qdrant builder raises KeyError('port').
QDRANT_WITHOUT_PORT = {"url": "http://127.0.0.1:9", "api_key": MARKER, "default_collection": "c"}
TERMINAL_ROW = ("The project's external connection (qdrant_config) cannot be used (KeyError). Check the "
                "connection in the project settings.")
ROW_STAYS = "its documents_in_progress row stays"


def envelope(value, key=KEY):
    """A column value as the frontend stores it."""
    return {"encrypted": encrypt(json.dumps(value), key)}


def corrupted(value):
    """A real envelope whose ciphertext was changed, so its tag no longer matches."""
    version, cipher_text, iv = envelope(value)["encrypted"].split(".")
    cipher_text = ("A" if cipher_text[0] != "A" else "B") + cipher_text[1:]
    return {"encrypted": ".".join([version, cipher_text, iv])}


class StoredConnections:
    """The host database's read of project_external_connections, for the real resolver."""

    def __init__(self, row):
        self.row = row

    def getExternalConnection(self, project_name):
        return self.row if project_name == "ece120" else None


class CountingResolver(worker_module.WorkerConnectionResolver):

    def __init__(self, sql):
        super().__init__(sql)
        self.documents_engine_calls = 0

    def resolve_documents_engine(self, project_name):
        self.documents_engine_calls += 1
        return super().resolve_documents_engine(project_name)


@pytest.fixture
def project_dbs(monkeypatch):
    """Every SQLAlchemyIngestDB the worker builds for a project's documents database."""
    built = []

    def project_db(engine=None):
        built.append(FakeStatusDB(engine))
        return built[-1]

    monkeypatch.setattr(worker_module, "SQLAlchemyIngestDB", project_db)
    return built


@pytest.fixture
def stored(worker, monkeypatch, caplog):
    """Give the worker the real resolver over one stored connection row of course ece120."""
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY", KEY)
    caplog.set_level(logging.DEBUG)
    worker.sql_session = FakeStatusDB()

    def use(row):
        worker.resolver = CountingResolver(StoredConnections(row))
        return worker.resolver

    return use


def assert_no_marker(caplog, *dbs):
    assert MARKER not in caplog.text
    for record in caplog.records:
        assert MARKER not in record.getMessage()
    for db in dbs:
        assert MARKER not in json.dumps(db.failed)


def test_broken_connection_is_recorded_in_the_project_documents_database(worker, stored, project_dbs, caplog):
    stored({"database_config": envelope(GOOD["database_config"]), "qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.published == [] and channel.acked == [7]
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError)"]
    # No traceback: its frames are the worker's, whose locals hold the whole message.
    assert errors(caplog)[0].exc_info is None
    [project_db] = project_dbs
    assert project_db.engine.url.database == "docs"
    assert [row["error"] for row in project_db.failed] == [TERMINAL_ROW]
    assert project_db.failed[0]["readable_filename"] == "a.pdf"
    assert project_db.failed[0]["s3_path"] == "courses/ece120/a.pdf"
    assert project_db.deleted == ["job-1"]
    # Never the host database for a project with its own documents database.
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []
    assert_no_marker(caplog, project_db)


def test_broken_connection_of_a_host_only_project_is_recorded_in_the_host_database(
        worker, stored, project_dbs, caplog):
    stored({"qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.published == [] and channel.acked == [7]
    assert len(errors(caplog)) == 1
    assert project_dbs == []
    assert [row["error"] for row in worker.sql_session.failed] == [TERMINAL_ROW]
    assert worker.sql_session.deleted == ["job-1"]
    assert_no_marker(caplog, worker.sql_session)


def test_broken_connection_on_a_redelivered_job_names_its_attempt(worker, stored, project_dbs, caplog):
    stored({"qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(3))
    assert channel.published == [] and channel.acked == [7]
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=4 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError)"]


def test_broken_documents_database_writes_nothing_anywhere(worker, stored, project_dbs, caplog):
    resolver = stored({"database_config": corrupted(GOOD["database_config"]),
                       "qdrant_config": envelope(GOOD["qdrant_config"])})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.published == [] and channel.acked == [7]
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=database_config cause=InvalidTag: "
        "the connection database_config of project ece120 cannot be used (InvalidTag); "
        "not recorded: the documents database of the project is the part that cannot be used; " + ROW_STAYS]
    # No second resolve, and no row on the host database in its place.
    assert resolver.documents_engine_calls == 0
    assert project_dbs == []
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []
    assert_no_marker(caplog)


def test_bad_connection_uri_names_its_field_and_cause(worker, stored, project_dbs, caplog):
    # The error's own text for a bad connection_uri names neither the field nor a type.
    bad_port = {"connection_uri": "postgresql://ext:" + MARKER + "@db.example.edu:notaport/docs"}
    stored({"database_config": envelope(bad_port), "qdrant_config": envelope(GOOD["qdrant_config"])})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.published == [] and channel.acked == [7]
    [record] = errors(caplog)
    assert record.getMessage() == (
        "job failed attempt=1 field=database_config cause=ValueError: "
        "the connection_uri of project ece120 is not a valid database URL; "
        "not recorded: the documents database of the project is the part that cannot be used; " + ROW_STAYS)
    assert project_dbs == []
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []
    assert_no_marker(caplog)


def test_every_field_under_another_key_names_both_and_writes_nothing(worker, stored, project_dbs, caplog,
                                                                     monkeypatch):
    stored({"database_config": envelope(GOOD["database_config"], OTHER_KEY),
            "qdrant_config": envelope(GOOD["qdrant_config"], OTHER_KEY)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.published == [] and channel.acked == [7]
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=InvalidTag: "
        "the connection qdrant_config of project ece120 cannot be used (InvalidTag); "
        "not recorded: the connection database_config of project ece120 cannot be used (InvalidTag); "
        + ROW_STAYS]
    assert project_dbs == []
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []
    assert_no_marker(caplog)


@pytest.mark.parametrize("where", ["documents database", "status database"])
def test_an_error_while_recording_is_folded_into_the_one_error(worker, stored, project_dbs, caplog, monkeypatch,
                                                               where):
    resolver = stored({"database_config": envelope(GOOD["database_config"]),
                       "qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    if where == "documents database":
        def unreachable(project_name):
            raise RuntimeError("could not translate host name " + DRIVER_HOST)

        monkeypatch.setattr(resolver, "resolve_documents_engine", unreachable)
    else:
        def broken_db(engine=None):
            raise RuntimeError("could not translate host name " + DRIVER_HOST)

        monkeypatch.setattr(worker_module, "SQLAlchemyIngestDB", broken_db)
    channel = FakeChannel()
    # Returns normally: the consumer keeps its connection.
    assert worker.process_job(channel, METHOD, HEADER, body(0)) is None
    assert channel.published == [] and channel.acked == [7]
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError); "
        "not recorded: RuntimeError; " + ROW_STAYS]
    assert_traceback_only_at_debug(caplog)
    assert MARKER not in caplog.text
    assert worker.sql_session.failed == [] and worker.sql_session.deleted == []


def test_broken_connection_keeps_the_in_progress_row_when_the_insert_fails(worker, stored, project_dbs, caplog,
                                                                           monkeypatch):
    monkeypatch.setattr(FakeStatusDB, "insert_result", False)
    stored({"database_config": envelope(GOOD["database_config"]), "qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.acked == [7] and channel.published == []
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError); "
        "not recorded: the insert into documents_failed failed; " + ROW_STAYS]
    assert project_dbs[0].deleted == []


def test_broken_connection_names_an_insert_that_raised(worker, stored, project_dbs, caplog, monkeypatch):
    monkeypatch.setattr(FakeStatusDB, "insert_result", RuntimeError("server closed the connection"))
    stored({"database_config": envelope(GOOD["database_config"]), "qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.acked == [7] and channel.published == []
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError); "
        "not recorded: the insert into documents_failed failed (RuntimeError); " + ROW_STAYS]
    assert project_dbs[0].deleted == []
    assert_traceback_only_at_debug(caplog, "server closed the connection")
    assert MARKER not in caplog.text


def test_broken_connection_says_when_its_in_progress_row_could_not_be_removed(worker, stored, project_dbs, caplog,
                                                                             monkeypatch):
    monkeypatch.setattr(FakeStatusDB, "delete_result", False)
    stored({"database_config": envelope(GOOD["database_config"]), "qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.acked == [7] and channel.published == []
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError); "
        "recorded, but its documents_in_progress row could not be removed"]
    assert [row["error"] for row in project_dbs[0].failed] == [TERMINAL_ROW]


def test_broken_connection_names_a_delete_that_raised(worker, stored, project_dbs, caplog, monkeypatch):
    monkeypatch.setattr(FakeStatusDB, "delete_result", RuntimeError("could not translate host name " + DRIVER_HOST))
    stored({"database_config": envelope(GOOD["database_config"]), "qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    channel = FakeChannel()
    worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.acked == [7] and channel.published == []
    assert [r.getMessage() for r in errors(caplog)] == [
        "job failed attempt=1 field=qdrant_config cause=KeyError: "
        "the connection qdrant_config of project ece120 cannot be used (KeyError); "
        "recorded, but its documents_in_progress row could not be removed (RuntimeError)"]
    assert [row["error"] for row in project_dbs[0].failed] == [TERMINAL_ROW]
    assert_traceback_only_at_debug(caplog)
    assert MARKER not in caplog.text


def test_terminal_error_record_holds_no_exception(worker, stored, project_dbs, caplog):
    stored({"qdrant_config": envelope(QDRANT_WITHOUT_PORT)})
    worker.process_job(FakeChannel(), METHOD, HEADER, body(0))
    [record] = errors(caplog)
    # An exception in the args would keep its traceback, and the frames' locals, alive with the record.
    assert not any(isinstance(arg, BaseException) for arg in record.args)


def test_the_delivery_is_acked_even_when_ending_the_job_raises(worker, stored, monkeypatch):
    stored({"qdrant_config": envelope(QDRANT_WITHOUT_PORT)})

    def raises(*args):
        raise RuntimeError("unexpected")

    monkeypatch.setattr(worker, "_fail_broken_connection", raises)
    channel = FakeChannel()
    with pytest.raises(RuntimeError):
        worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.acked == [7] and channel.published == []


def test_a_failed_ack_after_a_broken_connection_reaches_the_consumer(worker, stored, project_dbs, caplog):
    stored({"qdrant_config": envelope(QDRANT_WITHOUT_PORT)})

    class LostChannel(FakeChannel):

        def basic_ack(self, delivery_tag):
            raise worker_module.pika.exceptions.StreamLostError("simulated drop")

    channel = LostChannel()
    # The broker redelivers the unacked message; listen_for_jobs reconnects.
    with pytest.raises(worker_module.pika.exceptions.AMQPError) as raised:
        worker.process_job(channel, METHOD, HEADER, body(0))
    assert channel.published == []
    assert len(errors(caplog)) == 1
    # listen_for_jobs logs the lost connection with its chain, which holds the config error.
    chain = "".join(traceback.format_exception(raised.type, raised.value, raised.tb))
    assert "ConnectionConfigError" in chain
    assert MARKER not in chain
