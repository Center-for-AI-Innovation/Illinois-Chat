"""
Tests for Canvas error handling in ``ai_ta_backend.rabbitmq.ingest_canvas`` (issue #354).

Coverage:
  - ``_canvas_request`` maps an HTTP error to CanvasError with the status, the
    first 500 characters of the body and the URL path (no query string), and a
    timeout to "Canvas unreachable".
  - ``auto_accept_enrollments`` turns a 401 on /users/self into "Canvas rejected
    the configured access token", with one ERROR line.
  - A failed download of a link with ``?verifier=<secret>`` never writes the
    secret to the log (the requests/urllib3 traceback repeats the full URL).
  - A video yt-dlp cannot fetch gives exactly one ERROR line (ours) and nothing
    on stderr: yt-dlp's own messages go to DEBUG through ``_YtDlpLogger``.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest
import requests

from ai_ta_backend.rabbitmq import ingest_canvas
from ai_ta_backend.rabbitmq.ingest_canvas import CanvasError, IngestCanvas
from ai_ta_backend.rabbitmq.log_setup import LineFormatter

SECRET = "SECRET0123456789"
# Port 9 on localhost refuses at once: a real requests failure without network.
UNREACHABLE = "http://127.0.0.1:9/courses/1/files/2/download?verifier=" + SECRET


def http_response(status, body, url):
    response = requests.Response()
    response.status_code = status
    response._content = body.encode()
    response.url = url
    response.reason = "Unauthorized"
    return response


def test_http_error_maps_to_status_body_and_path(monkeypatch):
    url = "https://canvas.illinois.edu/api/v1/users/self?verifier=" + SECRET
    monkeypatch.setattr(requests, "request", lambda *a, **k: http_response(401, "x" * 900, url))
    with pytest.raises(CanvasError) as info:
        IngestCanvas()._canvas_request("GET", url)
    error = info.value
    assert error.upstream_status == 401
    assert error.upstream_message == "x" * 500
    assert error.path == "/api/v1/users/self"
    assert error.describe() == "Canvas 401 for /api/v1/users/self"


def test_timeout_maps_to_canvas_unreachable(monkeypatch):
    url = "https://canvas.illinois.edu/api/v1/courses/1/files?verifier=" + SECRET

    def timeout(*args, **kwargs):
        raise requests.Timeout("Read timed out for url: /api/v1/courses/1/files?verifier=" + SECRET)

    monkeypatch.setattr(requests, "request", timeout)
    with pytest.raises(CanvasError) as info:
        IngestCanvas()._canvas_request("GET", url)
    error = info.value
    assert error.message == "Canvas unreachable"
    assert error.upstream_status is None
    assert error.path == "/api/v1/courses/1/files"
    assert error.upstream_message.startswith("Timeout: ")
    assert SECRET not in error.upstream_message


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

    # The reproduction is real: the exception text carries the secret.
    assert len(captured) == 1 and isinstance(captured[0], requests.ConnectionError)
    assert SECRET in str(captured[0])
    # The log and the returned result do not.
    output = "\n".join(collector.lines)
    assert "url=/courses/1/files/2/download: ConnectionError: " in output
    assert SECRET not in output
    assert "Traceback" not in output
    assert result.startswith("Failed! Error: ") and SECRET not in result


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
        result = IngestCanvas().download_videos_from_urls(["http://127.0.0.1:9/x?verifier=" + SECRET], 1, str(tmp_path))
    finally:
        root.removeHandler(collector)
        root.setLevel(old_level)

    assert len(captured) == 1 and isinstance(captured[0], ingest_canvas.yt_dlp.utils.DownloadError)
    assert result.startswith("Failed! Error: ")
    assert capfd.readouterr().err == ""
    errors = [line for line in collector.lines if " ERROR   " in line.splitlines()[0]]
    assert len(errors) == 1, collector.lines
    assert "downloading Canvas videos failed canvas_course_id=1 url=/x" in errors[0]
    # yt-dlp's own messages are kept, at DEBUG, without the query string.
    assert any(" DEBUG   " in line and "yt-dlp: " in line for line in collector.lines)
    assert SECRET not in "\n".join(collector.lines)
