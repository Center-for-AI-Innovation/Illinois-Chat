"""
Tests for ``ProcessPoolExecutorAdapter`` failure logging (issue #354).

A failing task gives exactly one ERROR line, written in the parent with the
submitter's request id; the child process writes none. A task whose argument
cannot be pickled (it never starts) also gives exactly one line. The failure
callback logs with the task's request id and then puts back the caller's context.
"""

from __future__ import annotations

import logging
from concurrent.futures import Future

import pytest

from ai_ta_backend.executors.process_pool_executor import ProcessPoolExecutorAdapter, _log_task_failure
from ai_ta_backend.rabbitmq.log_setup import LineFormatter, bind, clear, current_context


def failing_task(value):
    raise ValueError("bad value %s" % value)


def ok_task(value):
    return value


class LineCollector(logging.Handler):
    """Formats at emit time, in the emitting thread, so the context fields are rendered."""

    def __init__(self):
        super().__init__(level=logging.ERROR)
        self.setFormatter(LineFormatter())
        self.lines = []

    def emit(self, record):
        self.lines.append(self.format(record))


@pytest.fixture
def collector():
    clear()
    handler = LineCollector()
    root = logging.getLogger()
    root.addHandler(handler)
    yield handler
    root.removeHandler(handler)
    clear()


def run(fn, arg):
    adapter = ProcessPoolExecutorAdapter(max_workers=1)
    bind(rid="pool1")
    future = adapter.submit(fn, arg)
    try:
        exc = future.exception(timeout=60)
    finally:
        # Joins the manager thread, so the done callback has run.
        adapter.executor.shutdown(wait=True)
    return exc


def test_runtime_failure_logs_one_error_with_rid(collector, capfd):
    exc = run(failing_task, 7)
    assert isinstance(exc, ValueError)
    lines = [line for line in collector.lines if "background task" in line]
    assert len(lines) == 1, collector.lines
    first = lines[0].splitlines()[0]
    assert " ERROR   " in first
    assert "rid=pool1 background task failing_task failed" in first
    assert "bad value 7" in lines[0]  # the traceback follows
    # The child writes nothing about the failure.
    assert "background task" not in capfd.readouterr().err


def failed_future():
    future = Future()
    future.set_exception(ValueError("boom"))
    return future


def test_failure_callback_logs_task_rid_and_restores_context(collector):
    # Called directly so the context check runs in the thread that ran the callback.
    bind(rid="A")
    _log_task_failure("t", {"rid": "B"}, failed_future())
    assert len(collector.lines) == 1, collector.lines
    assert "rid=B background task t failed" in collector.lines[0]
    assert current_context() == {"rid": "A"}


def test_failure_callback_without_prior_context_leaves_none(collector):
    _log_task_failure("t", {"rid": "B"}, failed_future())
    assert "rid=B background task t failed" in collector.lines[0]
    assert current_context() == {}


def test_unpicklable_argument_logs_one_error(collector):
    exc = run(ok_task, lambda: None)
    assert exc is not None
    lines = [line for line in collector.lines if "background task" in line]
    assert len(lines) == 1, collector.lines
    assert "rid=pool1 background task ok_task failed" in lines[0]
