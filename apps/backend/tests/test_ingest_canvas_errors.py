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


def _modules(canvas, tmp_path):
    modules = [{"position": 1, "name": "m", "items": [{"type": "ExternalUrl", "title": "t", "external_url": UNREACHABLE}]}]
    canvas._canvas_request = lambda method, url: SimpleNamespace(json=lambda: modules)
    return canvas.download_modules(str(tmp_path), "https://canvas.illinois.edu/api/v1/courses/1")


@pytest.mark.parametrize("download", [_files, _videos, _modules])
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
