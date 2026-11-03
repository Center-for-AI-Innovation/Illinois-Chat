"""
Tests for the ``/canvas_ingest`` reply when nothing was queued (issue #354):
a failed section is a 502 with the section results; an empty course is a 200.
"""

from __future__ import annotations

import logging

import pytest

from ai_ta_backend import main


class FakeIngester:
    section_results = {}

    def auto_accept_enrollments(self, canvas_course_id):
        pass

    def ingest_course_content(self, canvas_course_id, course_name, content_ingest_dict):
        return [], dict(self.section_results)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CANVAS_ACCESS_TOKEN", "token")
    monkeypatch.setattr(main, "IngestCanvas", FakeIngester)
    return main.app.test_client()


BODY = {"course_name": "ece120", "canvas_url": "https://canvas.illinois.edu/courses/123", "assignments": "true"}


def test_no_jobs_and_a_failed_section_is_502(client, caplog):
    caplog.set_level(logging.INFO)
    FakeIngester.section_results = {"assignments": "Failed! Canvas 403 for /api/v1/courses/123/assignments",
                                    "pages": "skipped"}
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 502
    assert response.get_json() == {"error": "Canvas ingest queued no documents",
                                   "section_results": FakeIngester.section_results}
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR] == [
        "canvas ingest queued no documents course=ece120 canvas_course_id=123 "
        "failed={'assignments': 'Failed! Canvas 403 for /api/v1/courses/123/assignments'}"]


def test_no_jobs_and_no_failed_section_is_200(client, caplog):
    caplog.set_level(logging.INFO)
    FakeIngester.section_results = {"assignments": "Success", "pages": "skipped", "file_links": "none found"}
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 200
    assert response.get_json() == {"outcome": "Queued Canvas Ingest task", "ingest_task_ids": [],
                                   "section_results": FakeIngester.section_results}
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR] == []
    assert "canvas ingest found no documents course=ece120 canvas_course_id=123" in caplog.text


def test_unexpected_error_names_only_the_exception_type(client, monkeypatch, caplog):
    caplog.set_level(logging.INFO)

    class Boom(FakeIngester):

        def ingest_course_content(self, canvas_course_id, course_name, content_ingest_dict):
            raise RuntimeError("db host db-internal.example.edu refused")

    monkeypatch.setattr(main, "IngestCanvas", Boom)
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 500
    assert response.get_json() == {"error": "Canvas ingest failed: RuntimeError",
                                   "message": "Internal Server Error: RuntimeError"}
    assert "db-internal" not in response.get_data(as_text=True)
    assert "db-internal.example.edu refused" in caplog.text


@pytest.mark.parametrize("results, expected", [
    ({"files": "Success", "pages": "Failed! TimeoutError"}, {"pages": "Failed! TimeoutError"}),
    ({"files": "skipped", "file_links": "none found"}, {}),
    (None, {}),
])
def test_failed_canvas_sections(results, expected):
    assert main._failed_canvas_sections(results) == expected
