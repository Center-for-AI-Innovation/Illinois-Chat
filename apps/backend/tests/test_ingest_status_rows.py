"""
Tests for the status rows that ``Ingest.main_ingest`` writes after the ingest has
its result (issue #354).

An error from the write of those rows must not change the result: a file that
was ingested gets no ``documents_failed`` row, and a file whose failure has a
row gets no second one. The missing rows are tried one more time, so the file
does not stay in ``documents_in_progress``.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import MagicMock

import pytest

from ai_ta_backend.rabbitmq import ingest as ingest_module

SUCCESS = {"success_ingest": "courses/proj/a.pdf", "failure_ingest": None}
FAILURE = {"success_ingest": None, "failure_ingest": {"s3_path": "courses/proj/a.pdf", "error": "No text detected in image"}}


@pytest.fixture
def run(monkeypatch):
    """Runs main_ingest with a fake database and a run_ingest that returns `result`."""
    monkeypatch.setattr(ingest_module.sentry_sdk, "capture_exception", lambda e: None)
    monkeypatch.setattr(ingest_module.sentry_sdk, "flush", lambda timeout=None: None)
    monkeypatch.setattr(ingest_module.time, "sleep", lambda seconds: None)

    def _run(sql, result):
        ingest = ingest_module.Ingest()
        monkeypatch.setattr(ingest, "initialize_resources", lambda **kwargs: setattr(ingest, "sql_session", sql))
        monkeypatch.setattr(ingest, "run_ingest", lambda *args, **kwargs: result)
        return json.loads(ingest.main_ingest(job_id="job-1", course_name="proj", s3_paths="courses/proj/a.pdf",
                                             readable_filename="a.pdf"))

    return _run


def errors(caplog):
    return [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]


def test_ingested_file_is_not_marked_failed_when_the_cleanup_raises(run, caplog):
    caplog.set_level(logging.INFO)
    sql = MagicMock()
    sql.delete_document_in_progress.side_effect = [RuntimeError("connection reset"), True]

    assert run(sql, SUCCESS) == SUCCESS

    sql.insert_failed_document.assert_not_called()
    # The delete is tried one more time, so the file does not stay "ingesting".
    assert sql.delete_document_in_progress.call_count == 2
    assert errors(caplog) == ["could not delete the documents_in_progress row"]


def test_recorded_failure_gets_no_second_row_when_the_cleanup_raises(run, caplog):
    caplog.set_level(logging.INFO)
    sql = MagicMock()
    sql.delete_document_in_progress.side_effect = [RuntimeError("connection reset"), True]

    assert run(sql, FAILURE) == FAILURE

    assert sql.insert_failed_document.call_count == 1
    assert sql.insert_failed_document.call_args.args[0]["error"] == "No text detected in image"
    assert sql.delete_document_in_progress.call_count == 2
    assert "recorded failure for file=courses/proj/a.pdf" in caplog.text


@pytest.mark.parametrize("first_answer", [RuntimeError("connection reset"), False])
def test_failure_row_that_was_not_written_is_tried_again(run, caplog, first_answer):
    """The database helper raises, or answers False for a SQL error that it logged itself."""
    caplog.set_level(logging.INFO)
    sql = MagicMock()
    sql.insert_failed_document.side_effect = [first_answer, True]

    assert run(sql, FAILURE) == FAILURE

    assert sql.insert_failed_document.call_count == 2
    # The delete worked on the first try and is not done a second time.
    sql.delete_document_in_progress.assert_called_once_with("job-1")
    assert "recorded failure for file=courses/proj/a.pdf" in caplog.text


def test_delete_that_answers_false_is_tried_again(run):
    sql = MagicMock()
    sql.delete_document_in_progress.side_effect = [False, True]

    assert run(sql, SUCCESS) == SUCCESS

    assert sql.delete_document_in_progress.call_count == 2
    sql.insert_failed_document.assert_not_called()


def test_rows_that_fail_two_times_are_logged_and_the_result_is_kept(run, caplog):
    caplog.set_level(logging.INFO)
    sql = MagicMock()
    sql.insert_failed_document.return_value = False
    sql.delete_document_in_progress.side_effect = RuntimeError("connection reset")

    assert run(sql, FAILURE) == FAILURE

    assert sql.insert_failed_document.call_count == 2 and sql.delete_document_in_progress.call_count == 2
    assert errors(caplog) == [
        "could not delete the documents_in_progress row",
        "could not delete the documents_in_progress row",
        "status rows not updated after 2 tries (failed_row_written=False in_progress_row_deleted=False); "
        "the dashboard can show a wrong status for the file"]
    # The line that says the failure is recorded would be false here.
    assert "recorded failure for file=" not in caplog.text


def test_error_after_the_status_rows_writes_no_failed_row(run, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    sql = MagicMock()

    def flush(timeout=None):
        raise RuntimeError("sentry transport closed")

    monkeypatch.setattr(ingest_module.sentry_sdk, "flush", flush)

    assert run(sql, SUCCESS) == SUCCESS

    sql.insert_failed_document.assert_not_called()
    sql.delete_document_in_progress.assert_called_once_with("job-1")
    assert errors(caplog) == ["ingest finished, but the end of the job failed"]


def test_error_before_the_ingest_has_a_result_is_still_recorded_as_failed(run, monkeypatch):
    sql = MagicMock()

    def boom(*args, **kwargs):
        raise RuntimeError("s3 download failed")

    ingest = ingest_module.Ingest()
    monkeypatch.setattr(ingest, "initialize_resources", lambda **kwargs: setattr(ingest, "sql_session", sql))
    monkeypatch.setattr(ingest, "run_ingest", boom)
    result = json.loads(ingest.main_ingest(job_id="job-1", course_name="proj", s3_paths="courses/proj/a.pdf",
                                           readable_filename="a.pdf"))

    assert result == {"failure_ingest": {"error": "RuntimeError: s3 download failed"}}
    assert sql.insert_failed_document.call_args.args[0]["error"] == "RuntimeError: s3 download failed"
    sql.delete_document_in_progress.assert_called_once_with("job-1")
