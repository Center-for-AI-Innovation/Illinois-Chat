"""
Unit tests for the worker's time-boxed ingest subprocess (run_ingest_isolated).

No broker, no database. The child target is swapped for small sleep / exit stubs
(spawned, like the real child, so the stubs must be importable module-level
functions) and the AMQP keepalive is a counter. Covers #376: the consumer thread
must keep servicing the connection while a document is being ingested, tolerate
the connection dying mid-job, and still enforce INGEST_SUBPROCESS_TIMEOUT.
"""

from __future__ import annotations

import os
import sys
import time

_RABBITMQ_DIR = os.path.join(os.path.dirname(__file__), "..", "ai_ta_backend", "rabbitmq")
# worker.py uses bare imports (the worker image ships only that folder). Put the folder on the path
# just long enough to import it, so later tests don't resolve bare names like `models` to it.
sys.path.insert(0, _RABBITMQ_DIR)
try:
    import worker  # noqa: E402
finally:
    sys.path.remove(_RABBITMQ_DIR)


def _child_sleep(job_id, inputs):
    time.sleep(inputs["seconds"])
    sys.exit(0)


def _child_exit_3(job_id, inputs):
    sys.exit(3)


class _Keepalive:
    def __init__(self, fail_on=None):
        self.calls = 0
        self.fail_on = fail_on

    def __call__(self):
        self.calls += 1
        if self.fail_on is not None and self.calls == self.fail_on:
            raise worker.pika.exceptions.StreamLostError("simulated drop")


def test_keepalive_is_serviced_while_child_runs():
    ka = _Keepalive()
    failure = worker.run_ingest_isolated("job", {"seconds": 2.5}, keepalive=ka, _target=_child_sleep)
    assert failure is None
    # One call per KEEPALIVE_INTERVAL; allow for spawn start-up and scheduler slack.
    assert ka.calls >= 2


def test_connection_loss_mid_job_does_not_abort_the_child():
    ka = _Keepalive(fail_on=1)
    failure = worker.run_ingest_isolated("job", {"seconds": 2.5}, keepalive=ka, _target=_child_sleep)
    assert failure is None, "the child's result must still be reported after the keepalive failed"
    assert ka.calls == 1, "keepalive must not be retried once the connection is known to be gone"


def test_timeout_still_kills_the_child(monkeypatch):
    monkeypatch.setattr(worker, "INGEST_TIMEOUT", 2)
    ka = _Keepalive()
    started = time.monotonic()
    failure = worker.run_ingest_isolated("job", {"seconds": 30}, keepalive=ka, _target=_child_sleep)
    elapsed = time.monotonic() - started
    assert failure is not None and "exceeded 2s" in failure
    assert elapsed < 15, f"kill happened too late: {elapsed:.1f}s"
    assert ka.calls >= 1


def test_abnormal_exit_is_reported():
    failure = worker.run_ingest_isolated("job", {}, keepalive=None, _target=_child_exit_3)
    assert failure is not None and "exit 3" in failure


def test_heartbeat_default_is_short_enough_for_aws_idle_timeouts(monkeypatch):
    # AWS NAT gateways and NLBs drop idle TCP flows after 350s; pika sends a frame every
    # heartbeat/2, so the default must keep that interval comfortably under 350s.
    monkeypatch.delenv("RABBITMQ_HEARTBEAT", raising=False)
    default = worker._heartbeat_from_env()
    assert 0 < default / 2 < worker.AWS_IDLE_CUTOFF
    assert worker.KEEPALIVE_INTERVAL < default / 2


def test_heartbeat_env_parsing(monkeypatch):
    # 0 would disable heartbeats in pika (the client value always overrides the broker's), so it
    # is refused; "broker" passes None, which accepts the broker's proposal.
    for raw, expected in [("", 60), ("120", 120), ("0", 60), ("-5", 60), ("abc", 60), ("broker", None)]:
        monkeypatch.setenv("RABBITMQ_HEARTBEAT", raw)
        assert worker._heartbeat_from_env() == expected, raw

