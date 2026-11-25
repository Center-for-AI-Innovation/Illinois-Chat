"""
The ingest child of ``rabbitmq/worker.py`` when the project's stored connection
stops being usable between the parent's resolve and the child's.

The child resolves the connections again (they do not survive the spawn). When
that raises ``ConnectionConfigError``, the child logs it, exits 3, and the parent
records the job as failed. The child's log must not hold the stored config: a
planted marker is in it, and the child's log is read back from a file.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import types
from types import SimpleNamespace

_RABBITMQ_DIR = os.path.join(os.path.dirname(__file__), "..", "ai_ta_backend", "rabbitmq")
# worker.py uses bare imports (the worker image ships only that folder). Put the folder on the path
# just long enough to import it, so later tests don't resolve bare names like `models` to it.
sys.path.insert(0, _RABBITMQ_DIR)
try:
    import worker  # noqa: E402
finally:
    sys.path.remove(_RABBITMQ_DIR)

from ai_ta_backend.utils.crypto import encrypt  # noqa: E402

KEY = "MARKER-key"
# Planted in the stored config: it must never reach the child's log.
MARKER = "MARKER-secret"
# A Qdrant config from before the port was stored: the builder raises KeyError('port').
QDRANT_WITHOUT_PORT = {"url": "http://127.0.0.1:9", "api_key": MARKER, "default_collection": "c"}


class _StoredConnections:
    """Stands in for the host database in the child: one stored connection row."""

    def getExternalConnection(self, project_name):
        return {"qdrant_config": {"encrypted": encrypt(json.dumps(QDRANT_WITHOUT_PORT), KEY)}}


def _child_with_a_broken_connection(job_id, rid, inputs):
    """Runs in the spawned child: the real _ingest_child, with the host database and the
    ingest module replaced, and its log also written to a file the test reads."""
    handler = logging.FileHandler(inputs["log_path"])
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
    logging.getLogger().addHandler(handler)
    sys.modules["ingest"] = types.SimpleNamespace(Ingest=None)  # never reached: resolve fails first
    sys.modules["rmsql"].SQLAlchemyIngestDB = _StoredConnections
    worker._ingest_child(job_id, rid, inputs)


class _StatusDB:

    def __init__(self):
        self.failed = []
        self.deleted = []

    def fetch_document_in_progress(self, job_id):
        return {"beam_task_id": job_id, "s3_path": "courses/ece120/a.pdf", "readable_filename": "a.pdf",
                "course_name": "ece120", "url": None, "base_url": None, "doc_groups": "", "error": None}

    def update_document_in_progress(self, row):
        return row

    def insert_failed_document(self, payload):
        self.failed.append(payload)
        return True

    def delete_document_in_progress(self, job_id):
        self.deleted.append(job_id)
        return True


class _Channel:

    def __init__(self):
        self.published = []
        self.acked = []

    def basic_publish(self, exchange, routing_key, properties, body):
        self.published.append(body)

    def basic_ack(self, delivery_tag):
        self.acked.append(delivery_tag)


def test_child_with_a_broken_connection_exits_3_and_the_parent_records_the_job(tmp_path, monkeypatch):
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY", KEY)  # the spawned child inherits the environment
    log_path = tmp_path / "child.log"
    real_run = worker.run_ingest_isolated
    monkeypatch.setattr(worker, "run_ingest_isolated", lambda job_id, rid, inputs, keepalive=None: real_run(
        job_id, rid, inputs, keepalive=keepalive, _target=_child_with_a_broken_connection))

    w = worker.Worker.__new__(worker.Worker)  # skip connect()
    w.rabbitmq_queue = "test-queue"
    w.resolver = SimpleNamespace(resolve=lambda course_name: SimpleNamespace(documents_sql_engine=None))
    w.sql_session = _StatusDB()
    w.connection = SimpleNamespace(process_data_events=lambda time_limit: None)
    channel = _Channel()
    message = {"job_id": "job-1", "request_id": "rid-1",
               "inputs": {"course_name": "ece120", "readable_filename": "a.pdf",
                          "s3_paths": ["courses/ece120/a.pdf"], "log_path": str(log_path)}}
    w.process_job(channel, SimpleNamespace(delivery_tag=7), SimpleNamespace(reply_to=None),
                  json.dumps(message).encode())

    assert channel.published == [] and channel.acked == [7]
    assert [row["error"] for row in w.sql_session.failed] == [
        "OCR/ingest subprocess exited abnormally (exit 3); see worker logs."]
    assert w.sql_session.deleted == ["job-1"]
    child_log = log_path.read_text()
    assert "ERROR worker ingest child failed" in child_log
    assert ("ConnectionConfigError: the connection qdrant_config of project ece120 cannot be used (KeyError)"
            in child_log)
    assert MARKER not in child_log
