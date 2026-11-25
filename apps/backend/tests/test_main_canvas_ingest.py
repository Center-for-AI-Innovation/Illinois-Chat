"""
Tests for the ``/canvas_ingest`` reply when nothing was queued (issue #354):
a failed section is a 502 with the section results; a course that Canvas gives
no access to, or that has no content in the selected sections, is a 422. No
case is a 200, because the app shows a 200 as a complete import.
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


def test_no_jobs_and_no_access_is_422_and_names_the_sections(client, caplog):
    caplog.set_level(logging.INFO)
    FakeIngester.section_results = {"files": "No access! Canvas 403 for /api/v1/courses/123/files",
                                    "pages": "No access! Canvas 401 for /api/v1/courses/123/pages",
                                    "syllabus": "none found", "assignments": "Success"}
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 422
    assert response.get_json() == {
        "error": "Canvas import found no documents. Canvas gives the Illinois Chat account no access to: "
                 "files, pages.",
        "section_results": FakeIngester.section_results}
    # Not our failure: a WARNING, no ERROR.
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR] == []
    assert ("canvas ingest found no documents course=ece120 canvas_course_id=123 "
            "no_access=['files', 'pages']") in caplog.text


def test_no_jobs_in_an_empty_course_is_422(client, caplog):
    caplog.set_level(logging.INFO)
    FakeIngester.section_results = {"assignments": "Success", "pages": "skipped", "file_links": "none found"}
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 422
    assert response.get_json() == {"error": "Canvas import found no documents in the selected sections.",
                                   "section_results": FakeIngester.section_results}
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR] == []
    assert "canvas ingest found no documents course=ece120 canvas_course_id=123 no_access=[]" in caplog.text


def test_a_failed_section_wins_over_no_access(client):
    FakeIngester.section_results = {"files": "No access! Canvas 403 for /api/v1/courses/123/files",
                                    "pages": "Failed! Canvas 500 for /api/v1/courses/123/pages"}
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 502


def test_queued_jobs_are_200_also_when_a_section_had_no_access(client, monkeypatch):

    class SomeFiles(FakeIngester):

        def ingest_course_content(self, canvas_course_id, course_name, content_ingest_dict):
            return ["job-1"], {"files": "No access! Canvas 403 for /api/v1/courses/123/files", "pages": "Success"}

    monkeypatch.setattr(main, "IngestCanvas", SomeFiles)
    response = client.post("/canvas_ingest", json=BODY)
    assert response.status_code == 200
    assert response.get_json()["ingest_task_ids"] == ["job-1"]


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
    ({"files": "No access! Canvas 403 for /x", "pages": "Failed! TimeoutError"}, {"pages": "Failed! TimeoutError"}),
    ({"files": "skipped", "file_links": "none found"}, {}),
    (None, {}),
])
def test_failed_canvas_sections(results, expected):
    assert main._failed_canvas_sections(results) == expected


@pytest.mark.parametrize("results, expected", [
    ({"files": "No access! Canvas 403 for /x", "pages": "Failed! TimeoutError", "syllabus": "none found"},
     {"files": "No access! Canvas 403 for /x"}),
    ({"files": "Success"}, {}),
    (None, {}),
])
def test_no_access_canvas_sections(results, expected):
    assert main._no_access_canvas_sections(results) == expected
