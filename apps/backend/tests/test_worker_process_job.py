"""
Tests for the failure path of ``Worker.process_job`` in ``rabbitmq/worker.py`` (issue #354).

A DB or resolver failure on the first attempt logs one ERROR, republishes the
message with retry_count + 1 and acks; the last attempt logs one ERROR, acks
and does not republish; a message that cannot be parsed is logged and acked.
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

    def resolve(self, course_name):
        raise RuntimeError("database unreachable")


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
