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


def test_ingested_file_is_not_marked_failed_when_the_cleanup_raises(run, caplog):
    caplog.set_level(logging.INFO)
    sql = MagicMock()
    sql.delete_document_in_progress.side_effect = [RuntimeError("connection reset"), True]

    assert run(sql, SUCCESS) == SUCCESS

    sql.insert_failed_document.assert_not_called()
    # The delete is tried one more time, so the file does not stay "ingesting".
    assert sql.delete_document_in_progress.call_count == 2
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR] == [
        "ingest finished, but its status rows could not be updated"]


def test_recorded_failure_gets_no_second_row_when_the_cleanup_raises(run):
    sql = MagicMock()
    sql.delete_document_in_progress.side_effect = [RuntimeError("connection reset"), True]

    assert run(sql, FAILURE) == FAILURE

    assert sql.insert_failed_document.call_count == 1
    assert sql.insert_failed_document.call_args.args[0]["error"] == "No text detected in image"
    assert sql.delete_document_in_progress.call_count == 2


def test_failure_whose_row_raised_is_written_on_the_second_try(run):
    sql = MagicMock()
    sql.insert_failed_document.side_effect = [RuntimeError("connection reset"), True]

    assert run(sql, FAILURE) == FAILURE

    assert sql.insert_failed_document.call_count == 2
    sql.delete_document_in_progress.assert_called_once_with("job-1")


def test_second_failure_of_the_status_rows_is_logged_and_keeps_the_result(run, caplog):
    caplog.set_level(logging.INFO)
    sql = MagicMock()
    sql.delete_document_in_progress.side_effect = RuntimeError("connection reset")

    assert run(sql, SUCCESS) == SUCCESS

    sql.insert_failed_document.assert_not_called()
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR] == [
        "ingest finished, but its status rows could not be updated",
        "status rows not updated on the second try; the file can show as ingesting"]


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
