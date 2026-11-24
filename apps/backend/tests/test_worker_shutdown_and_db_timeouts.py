"""
Unit tests for the worker's shutdown path and its database time limits.

No broker, no Postgres. Covers:
- SIGTERM stops the consumer, and an ingest that is running is stopped and its job handed
  back to the queue (unacked, in-progress row reset) instead of being recorded as a crash.
- connect_timeout is only passed to the Postgres drivers that take it (SQLite refuses it),
  and never replaces one written in a project's own connection URI.
- A statement time limit is set per transaction, on Postgres only, and only where asked.
"""

from __future__ import annotations

import os
import signal
import sys
import threading
import time
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine

_RABBITMQ_DIR = os.path.join(os.path.dirname(__file__), "..", "ai_ta_backend", "rabbitmq")
# worker.py uses bare imports (the worker image ships only that folder). Put the folder on the path
# just long enough to import it, so later tests don't resolve bare names like `models` to it.
sys.path.insert(0, _RABBITMQ_DIR)
try:
    import worker  # noqa: E402
    import rmsql  # noqa: E402
finally:
    sys.path.remove(_RABBITMQ_DIR)


# ── run_ingest_isolated: stop for a shutdown ──


def _child_sleep(job_id, inputs):
    time.sleep(inputs["seconds"])
    sys.exit(0)


def test_shutdown_kills_a_running_child_and_reports_interrupted():
    started = time.monotonic()
    failure = worker.run_ingest_isolated(
        "job", {"seconds": 60}, should_stop=lambda: time.monotonic() - started > 1.5, _target=_child_sleep)
    elapsed = time.monotonic() - started
    assert failure is worker.INTERRUPTED
    assert elapsed < 15, f"the child was not stopped promptly: {elapsed:.1f}s"


def test_shutdown_before_the_child_starts_does_not_start_it():
    started = time.monotonic()
    failure = worker.run_ingest_isolated("job", {"seconds": 60}, should_stop=lambda: True, _target=_child_sleep)
    assert failure is worker.INTERRUPTED
    assert time.monotonic() - started < 1, "a child was started (spawn alone takes longer than this)"


def test_a_child_that_finishes_is_not_reported_interrupted():
    failure = worker.run_ingest_isolated("job", {"seconds": 0.2}, should_stop=lambda: False, _target=_child_sleep)
    assert failure is None


# ── process_job: what happens to the job ──


class _StatusDB:
    """Stands in for SQLAlchemyIngestDB: one in-progress row, every call recorded."""

    def __init__(self, error=None, fail_update_from=None):
        self.row = {"beam_task_id": "job-1", "s3_path": "courses/c/a.pdf", "readable_filename": "a.pdf",
                    "course_name": "c", "url": None, "base_url": None, "doc_groups": "", "error": error}
        self.calls = []
        self.updates = []
        self.fail_update_from = fail_update_from

    def fetch_document_in_progress(self, job_id):
        self.calls.append("fetch")
        return dict(self.row)

    def update_document_in_progress(self, doc):
        self.calls.append("update")
        if self.fail_update_from is not None and self.calls.count("update") >= self.fail_update_from:
            raise RuntimeError("database gone")
        self.updates.append(doc["error"])
        self.row["error"] = doc["error"]

    def insert_failed_document(self, payload):
        self.calls.append("insert_failed")
        return True

    def delete_document_in_progress(self, job_id):
        self.calls.append("delete")
        return True


class _Channel:
    def __init__(self):
        self.acked = []
        self.published = []

    def basic_ack(self, delivery_tag):
        self.acked.append(delivery_tag)

    def basic_publish(self, **kwargs):
        self.published.append(kwargs)


def _worker(status_db):
    w = worker.Worker.__new__(worker.Worker)  # no broker or database connection
    w._stop = threading.Event()
    w.rabbitmq_queue = "q"
    w.sql_session = status_db
    w.resolver = SimpleNamespace(resolve=lambda course: SimpleNamespace(documents_sql_engine=None))
    w.heartbeats = []
    w.connection = SimpleNamespace(process_data_events=lambda time_limit: w.heartbeats.append(len(status_db.calls)))
    return w


def _deliver(w, channel):
    body = b'{"job_id": "job-1", "inputs": {"course_name": "c", "s3_paths": ["courses/c/a.pdf"]}}'
    w.process_job(channel, SimpleNamespace(delivery_tag=7), SimpleNamespace(reply_to=None), body)


def test_interrupted_job_is_left_unacked_with_its_row_reset(monkeypatch):
    seen = {}

    def fake_run(job_id, inputs, keepalive=None, should_stop=None):
        seen["should_stop"] = should_stop
        return worker.INTERRUPTED

    monkeypatch.setattr(worker, "run_ingest_isolated", fake_run)
    db, channel = _StatusDB(error=None), _Channel()
    w = _worker(db)
    _deliver(w, channel)

    assert db.updates == ["Attempting ingest", None], "the row must go back to its state before the ingest"
    assert channel.acked == [] and channel.published == [], "unacked, so the broker requeues it; no republish"
    assert "insert_failed" not in db.calls and "delete" not in db.calls
    # The ingest is told to stop by the same flag stop() sets.
    assert seen["should_stop"]() is False
    w.stop()
    assert seen["should_stop"]() is True


def test_interrupted_job_stays_unacked_when_the_row_cannot_be_reset(monkeypatch):
    monkeypatch.setattr(worker, "run_ingest_isolated", lambda *a, **k: worker.INTERRUPTED)
    db, channel = _StatusDB(fail_update_from=2), _Channel()
    _deliver(_worker(db), channel)  # must not raise: the consumer thread has to get to close()
    assert channel.acked == [] and channel.published == []


def test_no_job_is_started_once_the_worker_is_stopping(monkeypatch):
    monkeypatch.setattr(worker, "run_ingest_isolated", lambda *a, **k: pytest.fail("ingest started"))
    db, channel = _StatusDB(), _Channel()
    w = _worker(db)
    w.stop()
    _deliver(w, channel)
    assert db.calls == [] and channel.acked == []


def test_a_finished_job_is_still_acked_and_heartbeats_are_sent_between_db_calls(monkeypatch):
    monkeypatch.setattr(worker, "run_ingest_isolated", lambda *a, **k: None)
    db, channel = _StatusDB(), _Channel()
    w = _worker(db)
    _deliver(w, channel)
    assert channel.acked == [7]
    # One after resolve (no status call yet), one after the fetch, both before the ingest.
    assert w.heartbeats == [0, 1]


def test_a_failed_ingest_is_still_recorded_and_acked(monkeypatch):
    monkeypatch.setattr(worker, "run_ingest_isolated", lambda *a, **k: "OCR/ingest subprocess exited abnormally")
    db, channel = _StatusDB(), _Channel()
    _deliver(_worker(db), channel)
    assert db.calls[-2:] == ["insert_failed", "delete"] and channel.acked == [7]


# ── SIGTERM ──


def test_sigterm_stops_the_worker_and_unwinds_like_ctrl_c():
    stopped = []
    previous = signal.getsignal(signal.SIGTERM)
    try:
        worker._install_sigterm_handler(SimpleNamespace(stop=lambda: stopped.append(True)))
        with pytest.raises(KeyboardInterrupt):
            os.kill(os.getpid(), signal.SIGTERM)
            time.sleep(5)  # the handler runs in this thread and raises out of the sleep
        assert stopped == [True]
    finally:
        signal.signal(signal.SIGTERM, previous)


# ── connect_timeout ──


@pytest.mark.parametrize("uri, expected", [
    ("postgresql://u:p@db.example:5432/app", {"connect_timeout": 10}),
    ("postgresql+psycopg2://u:p@db.example/app", {"connect_timeout": 10}),
    ("postgresql+psycopg://u:p@db.example/app", {"connect_timeout": 10}),
    # The project's own setting wins.
    ("postgresql://u:p@db.example/app?connect_timeout=30", {}),
    ("postgresql://u:p@db.example/app?sslmode=require", {"connect_timeout": 10}),
    # Drivers that refuse the argument.
    ("sqlite:///local.db", {}),
    ("postgresql+asyncpg://u:p@db.example/app", {}),
    ("not a url", {}),
])
def test_connect_timeout_only_where_the_driver_takes_it(uri, expected):
    assert rmsql.postgres_connect_args(uri) == expected


def test_a_uri_connect_timeout_reaches_the_driver_unchanged():
    engine = create_engine("postgresql://u:p@db.example/app?connect_timeout=30",
                           connect_args=rmsql.postgres_connect_args("postgresql://u:p@db.example/app?connect_timeout=30"))
    _, params = engine.dialect.create_connect_args(engine.url)
    assert params["connect_timeout"] == "30"


def test_sqlite_host_database_still_connects(monkeypatch, tmp_path):
    for var in ("POSTGRES_USERNAME", "POSTGRES_PASSWORD", "POSTGRES_ENDPOINT"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("SQLITE_DB_NAME", str(tmp_path / "local.db"))
    # The worker's consumer thread asks for a statement limit too; SQLite must ignore it.
    db = rmsql.SQLAlchemyIngestDB(statement_timeout=30)
    with db.get_session() as session:
        assert session.execute(rmsql.text("select 1")).scalar() == 1


# ── statement time limit ──


class _Conn:
    def __init__(self):
        self.sql = []

    def exec_driver_sql(self, statement):
        self.sql.append(statement)


def _begin_sql(engine):
    conn = _Conn()
    for listener in engine.dispatch.begin:
        listener(conn)
    return conn.sql


def test_statement_limit_is_set_per_transaction_on_postgres():
    engine = create_engine("postgresql://u:p@db.example/app")  # lazy: never connects
    rmsql.SQLAlchemyIngestDB(engine=engine, statement_timeout=30)
    assert _begin_sql(engine) == ["SET LOCAL statement_timeout = 30000"]


@pytest.mark.parametrize("seconds", [None, 0])
def test_no_statement_limit_unless_asked(seconds):
    # The ingest child and the backend build their engines without one.
    engine = create_engine("postgresql://u:p@db.example/app")
    rmsql.SQLAlchemyIngestDB(engine=engine, statement_timeout=seconds)
    assert _begin_sql(engine) == []


def test_no_statement_limit_on_sqlite():
    engine = create_engine("sqlite://")
    rmsql.limit_statement_time(engine, 30)
    assert _begin_sql(engine) == []


def test_statement_timeout_env_parsing(monkeypatch):
    for raw, expected in [("", 30), ("15", 15), ("0", 0), ("-1", 30), ("abc", 30)]:
        monkeypatch.setenv("INGEST_DB_STATEMENT_TIMEOUT", raw)
        assert worker._statement_timeout_from_env() == expected, raw
