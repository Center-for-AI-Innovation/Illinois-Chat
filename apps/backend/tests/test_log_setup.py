"""
Unit tests for the shared logging module ``ai_ta_backend.rabbitmq.log_setup`` (issue #354).

Coverage:
  - LineFormatter: line shape (UTC time with ms, padded level, logger name,
    context fields, message), newline escaping, URL password redaction,
    traceback on the following lines.
  - bind / clear / current_rid / current_context: None drops a field, a list
    renders its first element, clear empties the context.
  - new_request_id: accepts safe incoming ids, replaces anything else.
  - configure_logging: LOG_LEVEL is honoured; an unknown name falls back to
    INFO with one WARNING line; library loggers sit at WARNING.
"""

from __future__ import annotations

import logging
import re

import pytest

from ai_ta_backend.rabbitmq import log_setup
from ai_ta_backend.rabbitmq.log_setup import (
    LineFormatter,
    bind,
    clear,
    configure_logging,
    current_context,
    current_rid,
    new_request_id,
    run_with_context,
)

LINE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (?P<level>[A-Z]+ *) (?P<name>\S+) (?P<rest>.*)$")


def make_record(msg, *args, name="ai_ta_backend.main", level=logging.INFO, exc_info=None):
    return logging.LogRecord(name, level, __file__, 1, msg, args, exc_info)


@pytest.fixture(autouse=True)
def _clean_context():
    clear()
    yield
    clear()


@pytest.fixture
def restore_root_logging():
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield
    root.handlers[:] = handlers
    root.setLevel(level)


def test_line_shape_without_context():
    line = LineFormatter().format(make_record("hello %s", "world"))
    match = LINE.match(line)
    assert match, line
    assert match.group("level") == "INFO   "
    assert match.group("name") == "ai_ta_backend.main"
    assert match.group("rest") == "hello world"


def test_line_shape_with_context_in_fixed_order():
    bind(course="ece120", rid="abc123", job="job-1")
    line = LineFormatter().format(make_record("queued", level=logging.WARNING, name="worker"))
    assert LINE.match(line), line
    assert " WARNING worker rid=abc123 job=job-1 course=ece120 queued" in line


def test_time_is_utc():
    record = make_record("x")
    record.created = 0.0
    record.msecs = 7
    assert LineFormatter().format(record).startswith("1970-01-01T00:00:00.007Z ")


def test_newlines_in_message_are_escaped():
    line = LineFormatter().format(make_record("first\nINFO fake line\r\nend"))
    assert "\n" not in line and "\r" not in line
    assert line.endswith("first\\nINFO fake line\\r\\nend")


def test_non_string_message_is_safe():
    line = LineFormatter().format(make_record({"a": "b\nc"}))
    assert "\n" not in line
    assert "{'a': 'b\\nc'}" in line


def test_traceback_follows_on_next_lines():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys
        record = make_record("failed", level=logging.ERROR, exc_info=sys.exc_info())
    lines = LineFormatter().format(record).split("\n")
    assert lines[0].endswith("failed")
    assert lines[1].startswith("Traceback (most recent call last):")
    assert lines[-1] == "ValueError: boom"


def test_password_in_url_is_redacted():
    line = LineFormatter().format(make_record("cannot connect to %s", "amqp://guest:s3cret@rabbitmq:5672"))
    assert "s3cret" not in line
    assert "amqp://***@rabbitmq:5672" in line


def test_url_without_password_is_unchanged():
    line = LineFormatter().format(make_record("GET https://canvas.illinois.edu/api/v1/users/self"))
    assert line.endswith("GET https://canvas.illinois.edu/api/v1/users/self")


def test_bind_none_drops_field_and_list_renders_first():
    bind(rid="r1", job="j1")
    bind(job=None, course=["ece120", "cs101"])
    assert current_context() == {"rid": "r1", "course": ["ece120", "cs101"]}
    line = LineFormatter().format(make_record("msg"))
    assert " rid=r1 course=ece120 msg" in line
    assert "job=" not in line


def test_clear_empties_context():
    bind(rid="r1", job="j1", course="c")
    assert current_rid() == "r1"
    clear()
    assert current_rid() is None
    assert current_context() == {}
    assert "rid=" not in LineFormatter().format(make_record("msg"))


def test_run_with_context_binds_and_clears():
    seen = {}

    def task(x):
        seen["rid"] = current_rid()
        return x * 2

    assert run_with_context({"rid": "bg1"}, "task", task, 21) == 42
    assert seen["rid"] == "bg1"
    assert current_rid() is None


def test_run_with_context_logs_and_reraises(caplog):

    def task():
        raise RuntimeError("nope")

    with caplog.at_level(logging.ERROR, logger=log_setup.logger.name):
        with pytest.raises(RuntimeError):
            run_with_context({"rid": "bg2"}, "task", task)
    assert any("background task task failed" in r.getMessage() for r in caplog.records)
    assert current_rid() is None


@pytest.mark.parametrize("incoming", ["test123", "a" * 64, "abc-DEF_09"])
def test_new_request_id_keeps_safe_ids(incoming):
    assert new_request_id(incoming) == incoming


@pytest.mark.parametrize("incoming", [None, "", "a" * 65, "has space", "line\nbreak", "semi;colon", 123])
def test_new_request_id_replaces_unsafe_ids(incoming):
    rid = new_request_id(incoming)
    assert rid != incoming
    assert re.fullmatch(r"[0-9a-f]{12}", rid)


def test_configure_logging_honours_level(monkeypatch, restore_root_logging):
    monkeypatch.setenv("LOG_LEVEL", "debug")
    assert configure_logging() == logging.DEBUG
    root = logging.getLogger()
    assert root.level == logging.DEBUG
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, LineFormatter)
    for name in ("pdfminer", "urllib3", "botocore", "pika", "httpx"):
        assert logging.getLogger(name).level == logging.WARNING


def test_configure_logging_unknown_level_falls_back_to_info(monkeypatch, capsys, restore_root_logging):
    monkeypatch.setenv("LOG_LEVEL", "LOUD")
    assert configure_logging() == logging.INFO
    assert logging.getLogger().level == logging.INFO
    warnings = [l for l in capsys.readouterr().err.splitlines() if "LOG_LEVEL" in l]
    assert len(warnings) == 1
    assert " WARNING " in warnings[0] and "unknown LOG_LEVEL=LOUD, using INFO" in warnings[0]



def test_configure_logging_keeps_python_warnings_but_drops_langchain_deprecations(restore_root_logging):
    import warnings

    class LangChainDeprecationWarning(DeprecationWarning):
        """Same name as langchain_core's class: the filter looks at the name in the message."""

    seen = []

    class Keep(logging.Handler):

        def emit(self, record):
            seen.append(record.getMessage())

    py_warnings = logging.getLogger("py.warnings")
    handler = Keep(level=logging.DEBUG)
    # An earlier configure_logging() call may have left the capture on with a hook
    # pytest has since replaced; start from a clean state.
    logging.captureWarnings(False)
    try:
        configure_logging()
        assert py_warnings.level == logging.WARNING
        py_warnings.addHandler(handler)
        with warnings.catch_warnings():
            warnings.simplefilter("always")
            warnings.warn("old API", LangChainDeprecationWarning)
            assert seen == []  # captured, then dropped by name
            warnings.warn("unclosed socket", ResourceWarning)
            warnings.warn("coroutine was never awaited", RuntimeWarning)
        assert [m for m in seen if "unclosed socket" in m]
        assert [m for m in seen if "never awaited" in m]
        assert not [m for m in seen if "old API" in m]
    finally:
        py_warnings.removeHandler(handler)
        py_warnings.removeFilter(log_setup._drop_langchain_deprecations)
        py_warnings.setLevel(logging.NOTSET)
        logging.captureWarnings(False)
