"""
Tests for Canvas error handling in ``ai_ta_backend.rabbitmq.ingest_canvas`` (issue #354).

Coverage:
  - ``_canvas_request`` maps an HTTP error to CanvasError with the status, the
    first 500 characters of the body and the URL path (no query string), and a
    timeout to "Canvas unreachable".
  - ``auto_accept_enrollments`` turns a 401 on /users/self into "Canvas rejected
    the configured access token", with one ERROR line.
  - A failed download of a link with ``?verifier=<marker>`` never writes the
    marker to the log (the requests/urllib3 traceback repeats the full URL).
  - A video yt-dlp cannot fetch gives exactly one ERROR line (ours) and nothing
    on stderr: yt-dlp's own messages go to DEBUG through ``_YtDlpLogger``.
  - A section that Canvas answers 401 or 403 for is "No access! ...", not
    "Failed! ..."; a course with no syllabus is "none found".
  - One bad item of a module (a dead external link) is skipped with one
    WARNING; the section is "Success" and keeps the items that are good.
  - An item that Canvas sends with no content (null or empty) makes no file,
    because each file in the folder is queued for ingest.
  - A 403 that is Canvas throttling ("Rate Limit Exceeded") is "Failed! ...".
  - A page yt-dlp does not support (``UnsupportedError``) gives one ERROR line
    with no traceback and no verifier: yt-dlp's text repeats the full URL.
"""

from __future__ import annotations

import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace

import pytest
import requests

from ai_ta_backend.rabbitmq import ingest_canvas
from ai_ta_backend.rabbitmq.ingest_canvas import CanvasError, IngestCanvas
from ai_ta_backend.rabbitmq.log_setup import LineFormatter

MARKER = "SECRET0123456789"
# Port 9 on localhost refuses at once: a real requests failure without network.
UNREACHABLE = "http://127.0.0.1:9/courses/1/files/2/download?verifier=" + MARKER


def http_response(status, body, url):
    response = requests.Response()
    response.status_code = status
    response._content = body.encode()
    response.url = url
    response.reason = "Unauthorized"
    return response


def test_http_error_maps_to_status_body_and_path(monkeypatch):
    url = "https://canvas.illinois.edu/api/v1/users/self?verifier=" + MARKER
    monkeypatch.setattr(requests, "request", lambda *a, **k: http_response(401, "x" * 900, url))
    with pytest.raises(CanvasError) as info:
        IngestCanvas()._canvas_request("GET", url)
    error = info.value
    assert error.upstream_status == 401
    assert error.upstream_message == "x" * 500
    assert error.path == "/api/v1/users/self"
    assert error.describe() == "Canvas 401 for /api/v1/users/self"


def test_timeout_maps_to_canvas_unreachable(monkeypatch):
    url = "https://canvas.illinois.edu/api/v1/courses/1/files?verifier=" + MARKER

    def timeout(*args, **kwargs):
        raise requests.Timeout("Read timed out for url: /api/v1/courses/1/files?verifier=" + MARKER)

    monkeypatch.setattr(requests, "request", timeout)
    with pytest.raises(CanvasError) as info:
        IngestCanvas()._canvas_request("GET", url)
    error = info.value
    assert error.message == "Canvas unreachable"
    assert error.upstream_status is None
    assert error.path == "/api/v1/courses/1/files"
    assert error.upstream_message.startswith("Timeout: ")
    assert MARKER not in error.upstream_message


def test_401_on_users_self_means_rejected_token(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    url = "https://canvas.illinois.edu/api/v1/users/self"
    monkeypatch.setattr(requests, "request", lambda *a, **k: http_response(401, '{"errors":"invalid"}', url))
    with pytest.raises(CanvasError) as info:
        IngestCanvas().auto_accept_enrollments("12345")
    assert info.value.message == "Canvas rejected the configured access token"
    assert info.value.upstream_status == 401
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert [r.getMessage() for r in errors] == ['Canvas 401 for /api/v1/users/self: {"errors":"invalid"}']


def test_throttling_on_users_self_is_not_a_rejected_token(monkeypatch):
    url = "https://canvas.illinois.edu/api/v1/users/self"
    monkeypatch.setattr(requests, "request",
                        lambda *a, **k: http_response(403, "403 Forbidden (Rate Limit Exceeded)", url))
    with pytest.raises(CanvasError) as info:
        IngestCanvas().auto_accept_enrollments("12345")
    # The token is good. The reply must not tell the admin to make a new one.
    assert info.value.message != "Canvas rejected the configured access token"
    assert info.value.upstream_status == 403
    assert info.value.upstream_message == "403 Forbidden (Rate Limit Exceeded)"


class LineCollector(logging.Handler):

    def __init__(self):
        super().__init__(level=logging.DEBUG)
        self.setFormatter(LineFormatter())
        self.lines = []

    def emit(self, record):
        self.lines.append(self.format(record))


def _files(canvas, tmp_path):
    return canvas.download_files_from_urls([UNREACHABLE], 1, str(tmp_path))


def _videos(canvas, tmp_path):
    return canvas.download_videos_from_urls([UNREACHABLE], 1, str(tmp_path))


@pytest.mark.parametrize("download", [_files, _videos])
def test_failed_download_does_not_log_the_verifier(download, monkeypatch, tmp_path):
    captured = []
    monkeypatch.setattr(ingest_canvas.sentry_sdk, "capture_exception", captured.append)
    collector = LineCollector()
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(collector)
    root.setLevel(logging.DEBUG)
    try:
        result = download(IngestCanvas(), tmp_path)
    finally:
        root.removeHandler(collector)
        root.setLevel(old_level)

    # The reproduction is real: the exception text carries the marker.
    assert len(captured) == 1 and isinstance(captured[0], requests.ConnectionError)
    assert MARKER in str(captured[0])
    # The log and the returned result do not.
    output = "\n".join(collector.lines)
    assert "url=/courses/1/files/2/download: ConnectionError: " in output
    assert MARKER not in output
    assert "Traceback" not in output
    assert result == "Failed! ConnectionError"


API = "https://canvas.illinois.edu/api/v1/courses/1"


def _collect(run):
    """Runs `run` and returns its result with the log lines and records it wrote."""
    collector = LineCollector()
    records = []
    recorder = logging.Handler(level=logging.DEBUG)
    recorder.emit = records.append
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(collector)
    root.addHandler(recorder)
    root.setLevel(logging.DEBUG)
    try:
        result = run()
    finally:
        root.removeHandler(collector)
        root.removeHandler(recorder)
        root.setLevel(old_level)
    return result, collector.lines, records


def test_one_bad_module_item_does_not_fail_the_section(monkeypatch, tmp_path):
    captured = []
    monkeypatch.setattr(ingest_canvas.sentry_sdk, "capture_exception", captured.append)
    modules = [{"position": 1, "name": "m", "items": [
        {"type": "ExternalUrl", "title": "dead link", "external_url": UNREACHABLE},
        # Canvas left the message of this discussion and the body of this page empty.
        {"type": "Discussion", "url": API + "/discussion_topics/5"},
        {"type": "Page", "url": API + "/pages/empty"},
        # The reply for this page has no "url" field, so the handler of the item raises.
        {"type": "Page", "url": API + "/pages/broken"},
        {"type": "Page", "url": API + "/pages/intro"},
    ]}]
    replies = {
        API + "/modules?include=items&per_page=50": modules,
        API + "/discussion_topics/5": {"title": "week 1", "message": None},
        API + "/pages/empty": {"url": "empty", "body": None},
        API + "/pages/broken": {"body": "<p>x</p>"},
        API + "/pages/intro": {"url": "intro", "body": "<p>hello</p>"},
    }
    canvas = IngestCanvas()
    canvas._canvas_request = lambda method, url: SimpleNamespace(json=lambda: replies[url])

    result, lines, records = _collect(lambda: canvas.download_modules(str(tmp_path), API))

    assert result == "Success"
    # Only the good item made a file: an empty file would be queued for ingest.
    assert [f.name for f in tmp_path.iterdir()] == ["Module_1_Page_intro.html"]
    assert (tmp_path / "Module_1_Page_intro.html").read_text() == "<p>hello</p>"
    warnings = [r.getMessage() for r in records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert warnings[0].startswith(
        "section=modules: 2 item(s) failed and were skipped, first: type=ExternalUrl ConnectionError: ")
    assert [r for r in records if r.levelno >= logging.ERROR] == []
    # The two items with no content are not counted: Canvas refused nothing.
    assert "section=modules downloaded=1 skipped=2" in "\n".join(lines)
    # A skipped item is not an event for Sentry, and the link's query string stays out of the log.
    assert captured == []
    assert MARKER not in "\n".join(lines)
    assert "Traceback" not in "\n".join(lines)


@pytest.mark.parametrize("body", [{"syllabus_body": None}, {"syllabus_body": ""}, {}])
def test_course_without_a_syllabus_is_none_found(body, tmp_path):
    canvas = IngestCanvas()
    canvas._canvas_request = lambda method, url: SimpleNamespace(json=lambda: body)

    result, lines, records = _collect(lambda: canvas.download_syllabus(str(tmp_path), API))

    assert result == "none found"
    assert list(tmp_path.iterdir()) == []
    assert [r for r in records if r.levelno >= logging.WARNING] == []
    assert "section=syllabus downloaded=0: the course has no syllabus" in "\n".join(lines)


@pytest.mark.parametrize("download", ["download_files", "download_pages", "download_syllabus", "download_modules",
                                      "download_assignments", "download_discussions"])
@pytest.mark.parametrize("status, expected", [
    (401, "No access! Canvas 401 for /api/v1/courses/1/x"),
    (403, "No access! Canvas 403 for /api/v1/courses/1/x"),
    (500, "Failed! Canvas 500 for /api/v1/courses/1/x"),
    (None, "Failed! Canvas unreachable for /api/v1/courses/1/x"),
])
def test_section_result_tells_no_access_from_a_failure(download, status, expected, tmp_path):
    canvas = IngestCanvas()

    def refuse(method, url):
        raise CanvasError("Canvas request failed", status, '{"errors":[{"message":"user not authorized"}]}',
                          "/api/v1/courses/1/x")

    canvas._canvas_request = refuse

    result, lines, records = _collect(lambda: getattr(canvas, download)(str(tmp_path), API))

    assert result == expected
    # One WARNING for the section, and no traceback: Canvas answered, nothing of ours broke.
    assert [r.levelno for r in records if r.levelno >= logging.WARNING] == [logging.WARNING]
    assert "Traceback" not in "\n".join(lines)


def test_canvas_throttling_is_a_failure_not_no_access(tmp_path):
    canvas = IngestCanvas()

    def throttle(method, url):
        raise CanvasError("Canvas request failed", 403, "403 Forbidden (Rate Limit Exceeded)", "/api/v1/courses/1/files")

    canvas._canvas_request = throttle
    assert canvas.download_files(str(tmp_path), API) == "Failed! Canvas 403 for /api/v1/courses/1/files"


@pytest.mark.parametrize("download, listing", [
    ("download_pages", [{"title": "p", "html_url": "u", "page_id": 7, "url": "p"}]),
    ("download_discussions", [{"title": "d", "message": None}, {"title": "e", "message": ""}]),
    ("download_assignments", [{"id": 1, "name": "a", "description": None}, {"id": 2, "name": "b", "description": " "}]),
])
def test_item_with_no_content_makes_no_file_and_does_not_fail_the_section(download, listing, tmp_path):
    canvas = IngestCanvas()
    # The list call gives the items; the call for one page gives a null body.
    canvas._canvas_request = lambda method, url: SimpleNamespace(
        json=lambda: {"body": None} if url.endswith("/pages/7") else listing)

    result, lines, records = _collect(lambda: getattr(canvas, download)(str(tmp_path), API))

    assert result == "Success"
    assert list(tmp_path.iterdir()) == []
    assert [r for r in records if r.levelno >= logging.WARNING] == []
    # An item with no content is not a downloaded item, and each one has a DEBUG line.
    output = "\n".join(lines)
    assert "section=%s downloaded=0" % download[len("download_"):] in output
    assert output.count("item has no content, no file made") == len(listing)


def test_file_item_of_a_module_does_not_log_its_download_link(tmp_path):
    """A Canvas File object has no body, and its `url` is the download link with `verifier=`."""
    link = "https://canvas.illinois.edu/files/77/download?download_frd=1&verifier=" + MARKER
    modules = [{"position": 1, "name": "m", "items": [
        {"type": "File", "url": API + "/files/77"},
        # A page whose `url` field has a token in it and whose body is only spaces.
        {"type": "Page", "url": API + "/pages/linked"},
    ]}]
    replies = {
        API + "/modules?include=items&per_page=50": modules,
        API + "/files/77": {"url": link, "display_name": "notes.pdf"},
        API + "/pages/linked": {"url": "doc?token=" + MARKER, "body": "   "},
    }
    canvas = IngestCanvas()
    canvas._canvas_request = lambda method, url: SimpleNamespace(json=lambda: replies[url])

    result, lines, records = _collect(lambda: canvas.download_modules(str(tmp_path), API))

    assert result == "Success"
    assert list(tmp_path.iterdir()) == []
    output = "\n".join(lines)
    assert MARKER not in output
    assert "module item has no body, no file made type=File" in output


def test_no_content_line_does_not_print_the_name(tmp_path):
    """A name can be a link with a token, also with "/" or a space in its query."""
    name = "p?next=/a/b&token=" + MARKER + " more=" + MARKER + ".html"
    result, lines, records = _collect(lambda: ingest_canvas._write_html(str(tmp_path), name, ""))
    assert result is False
    assert list(tmp_path.iterdir()) == []
    assert lines and MARKER not in "\n".join(lines)


def test_title_with_a_slash_does_not_fail_the_section(tmp_path):
    canvas = IngestCanvas()
    discussions = [{"title": "HW 1/2", "message": "<p>due Friday</p>"}, {"title": "Week 2", "message": "<p>x</p>"}]
    canvas._canvas_request = lambda method, url: SimpleNamespace(json=lambda: discussions)

    result, lines, records = _collect(lambda: canvas.download_discussions(str(tmp_path), API))

    assert result == "Success"
    assert sorted(f.name for f in tmp_path.iterdir()) == ["HW 1_2.html", "Week 2.html"]
    assert (tmp_path / "HW 1_2.html").read_text() == "<p>due Friday</p>"
    assert "section=discussions downloaded=2" in "\n".join(lines)


def test_external_link_with_an_empty_page_makes_no_file(monkeypatch, tmp_path):
    modules = [{"position": 1, "name": "m", "items": [
        {"type": "ExternalUrl", "title": "blank", "external_url": "https://example.edu/blank"}]}]
    canvas = IngestCanvas()
    canvas._canvas_request = lambda method, url: SimpleNamespace(json=lambda: modules)
    monkeypatch.setattr(ingest_canvas.requests, "get",
                        lambda url, timeout=None: SimpleNamespace(status_code=200, text="  \n"))

    result, lines, records = _collect(lambda: canvas.download_modules(str(tmp_path), API))

    assert result == "Success"
    assert list(tmp_path.iterdir()) == []
    assert "section=modules downloaded=0 skipped=0" in "\n".join(lines)


class _FakeResponse:
    """What ``requests.get(..., stream=True)`` returns, used as a context manager."""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_failed_video_logs_one_error_and_nothing_on_stderr(monkeypatch, tmp_path, capfd):
    # Only the pre-flight requests.get is faked; yt-dlp really runs and fails on the refused port.
    monkeypatch.setattr(ingest_canvas.requests, "get", lambda *a, **k: _FakeResponse())
    captured = []
    monkeypatch.setattr(ingest_canvas.sentry_sdk, "capture_exception", captured.append)
    collector = LineCollector()
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(collector)
    root.setLevel(logging.DEBUG)
    try:
        result = IngestCanvas().download_videos_from_urls(["http://127.0.0.1:9/x?verifier=" + MARKER], 1, str(tmp_path))
    finally:
        root.removeHandler(collector)
        root.setLevel(old_level)

    assert len(captured) == 1 and isinstance(captured[0], ingest_canvas.yt_dlp.utils.DownloadError)
    assert result == "Failed! DownloadError"
    assert capfd.readouterr().err == ""
    errors = [line for line in collector.lines if " ERROR   " in line.splitlines()[0]]
    assert len(errors) == 1, collector.lines
    assert "downloading Canvas videos failed canvas_course_id=1 url=/x" in errors[0]
    # yt-dlp's own messages are kept, at DEBUG, without the query string.
    assert any(" DEBUG   " in line and "yt-dlp: " in line for line in collector.lines)
    assert MARKER not in "\n".join(collector.lines)


class _NoMediaPage(BaseHTTPRequestHandler):
    """An HTML page with no video on it: yt-dlp's generic extractor raises UnsupportedError."""

    def do_GET(self):
        body = b"<html><body><p>no media here</p></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def test_unsupported_video_page_logs_no_traceback_and_no_verifier(monkeypatch, tmp_path):
    marker = "SuperSecretVerifier123"
    server = HTTPServer(("127.0.0.1", 0), _NoMediaPage)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/page.html?verifier=%s" % (server.server_address[1], marker)
    monkeypatch.setattr(ingest_canvas.requests, "get", lambda *a, **k: _FakeResponse())
    captured = []
    monkeypatch.setattr(ingest_canvas.sentry_sdk, "capture_exception", captured.append)
    collector = LineCollector()
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(collector)
    root.setLevel(logging.DEBUG)
    try:
        result = IngestCanvas().download_videos_from_urls([url], 1, str(tmp_path))
    finally:
        root.removeHandler(collector)
        root.setLevel(old_level)
        server.shutdown()
        server.server_close()

    # The reproduction is real: yt-dlp's exception text carries the marker.
    assert len(captured) == 1 and isinstance(captured[0], ingest_canvas.yt_dlp.utils.DownloadError)
    assert marker in str(captured[0])
    errors = [line for line in collector.lines if " ERROR   " in line.splitlines()[0]]
    assert len(errors) == 1, collector.lines
    assert "downloading Canvas videos failed canvas_course_id=1 url=/page.html: DownloadError: " in errors[0]
    assert "Unsupported URL: " in errors[0]
    output = "\n".join(collector.lines)
    assert "Traceback" not in output
    assert marker not in output
    # yt-dlp's own text is kept at DEBUG, without the query string.
    assert any(" DEBUG   " in line and "yt-dlp: " in line and "Unsupported URL" in line for line in collector.lines)
    assert result == "Failed! DownloadError"


def test_safe_join_keeps_files_inside_the_download_folder(tmp_path):
    root = str(tmp_path)
    assert ingest_canvas._safe_join(root, "notes.pdf") == os.path.join(root, "notes.pdf")
    assert ingest_canvas._safe_join(root, "../escape.pdf") == os.path.join(root, "escape.pdf")
    with pytest.raises(ValueError):
        ingest_canvas._safe_join(root, "..")
