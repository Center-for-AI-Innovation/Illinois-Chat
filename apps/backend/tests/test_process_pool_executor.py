"""
Tests for ``ProcessPoolExecutorAdapter`` failure logging (issue #354).

A failing task gives exactly one ERROR line, written in the parent with the
submitter's request id; the child process writes none. A task whose argument
cannot be pickled (it never starts) also gives exactly one line.
"""

from __future__ import annotations

import logging

import pytest

from ai_ta_backend.executors.process_pool_executor import ProcessPoolExecutorAdapter
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
    # The callback put back the submitter's context.
    assert current_context() == {"rid": "pool1"}


def test_unpicklable_argument_logs_one_error(collector):
    exc = run(ok_task, lambda: None)
    assert exc is not None
    lines = [line for line in collector.lines if "background task" in line]
    assert len(lines) == 1, collector.lines
    assert "rid=pool1 background task ok_task failed" in lines[0]
