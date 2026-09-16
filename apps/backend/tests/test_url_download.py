"""Unit tests for the worker's crawled-PDF fetch (`rabbitmq/url_download.py`).

The worker now downloads PDFs from URLs supplied over the network, so the SSRF
guard, the size cap and the "is this actually a PDF" check are the security
boundary. All of it is exercised here with injected resolvers and sessions —
no sockets, no S3, and no import of `ingest.py` (which needs fitz/tesseract).
"""

from __future__ import annotations

import re
import socket

import pytest

from ai_ta_backend.rabbitmq.url_download import (
    MAX_PDF_BYTES,
    UrlDownloadError,
    build_crawl_pdf_key,
    download_pdf_to_tempfile,
    is_non_retryable,
    sanitize_pdf_filename,
    validate_public_http_url,
)

PDF_BYTES = b"%PDF-1.7\nfake pdf body\n"


# ──────────────────────────── test doubles ────────────────────────────


def resolver_for(mapping):
    """A getaddrinfo stand-in: {hostname: [ip, ...]}; unknown hosts raise (NXDOMAIN)."""

    def _resolve(hostname, port, *args, **kwargs):
        if hostname not in mapping:
            raise socket.gaierror(f"no such host: {hostname}")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in mapping[hostname]]

    return _resolve


PUBLIC_RESOLVER = resolver_for({"public.example.com": ["93.184.216.34"], "other.example.com": ["93.184.216.35"]})


class FakeResponse:

    def __init__(self, status_code=200, headers=None, body=b"", chunk_size=None, raise_after=None):
        self.status_code = status_code
        self.headers = headers or {}
        self._body = body
        self._chunk_size = chunk_size
        self._raise_after = raise_after

    @property
    def is_redirect(self):
        return self.status_code in (301, 302, 303, 307, 308) and "Location" in self.headers

    def iter_content(self, chunk_size=1):
        size = self._chunk_size or chunk_size
        emitted = 0
        for start in range(0, len(self._body), size):
            if self._raise_after is not None and emitted >= self._raise_after:
                import requests
                raise requests.ConnectionError("connection reset mid-body")
            emitted += 1
            yield self._body[start:start + size]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeSession:
    """Serves queued responses in order and records the URLs requested."""

    def __init__(self, *responses):
        self._responses = list(responses)
        self.requested_urls = []

    def get(self, url, **kwargs):
        self.requested_urls.append(url)
        if not self._responses:
            raise AssertionError(f"unexpected extra request to {url}")
        return self._responses.pop(0)


def pdf_response(body=PDF_BYTES, content_type="application/pdf", **headers):
    merged = {"Content-Type": content_type}
    merged.update(headers)
    return FakeResponse(200, merged, body)


# ──────────────────────────── SSRF guard ────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/x.pdf",
        "http://10.0.0.5/x.pdf",
        "http://192.168.1.1/x.pdf",
        "http://172.16.0.1/x.pdf",
        "http://[::1]/x.pdf",
        "http://169.254.169.254/latest/meta-data",  # cloud metadata
        "http://localhost/x.pdf",
        "http://0.0.0.0/x.pdf",
        "http://service.internal/x.pdf",
        "http://printer.local/x.pdf",
    ],
)
def test_rejects_non_public_targets(url):
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url(url, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "blocked_url"


@pytest.mark.parametrize("url", ["ftp://public.example.com/x.pdf", "file:///etc/passwd", "gopher://x/1"])
def test_rejects_non_http_schemes(url):
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url(url, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "blocked_url"


@pytest.mark.parametrize("port", [9200, 6379, 2375, 8080, 22])
def test_rejects_non_web_ports(port):
    """Without a port allow-list, any resolvable host on :9200 reaches Elasticsearch."""
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url(f"http://public.example.com:{port}/x.pdf", resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "blocked_url"
    assert "port" in exc.value.detail


@pytest.mark.parametrize(
    "url",
    [
        "http://public.example.com/x.pdf",
        "http://public.example.com:80/x.pdf",
        "https://public.example.com/x.pdf",
        "https://public.example.com:443/x.pdf",
    ],
)
def test_accepts_public_http_urls(url):
    validate_public_http_url(url, resolver=PUBLIC_RESOLVER)


@pytest.mark.parametrize(
    "url",
    [
        "http://user:pw@public.example.com/x.pdf",
        "http://user@public.example.com/x.pdf",
    ],
)
def test_rejects_embedded_credentials(url):
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url(url, resolver=PUBLIC_RESOLVER)
    assert "credentials" in exc.value.detail


def test_rejects_ipv4_mapped_loopback():
    """::ffff:127.0.0.1 is not caught by the IPv6 private ranges; it must be unwrapped."""
    resolver = resolver_for({"sneaky.example.com": ["::ffff:127.0.0.1"]})
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url("http://sneaky.example.com/x.pdf", resolver=resolver)
    assert exc.value.reason == "blocked_url"


def test_rejects_public_hostname_resolving_to_private_ip():
    resolver = resolver_for({"evil.example.com": ["10.1.2.3"]})
    with pytest.raises(UrlDownloadError):
        validate_public_http_url("http://evil.example.com/x.pdf", resolver=resolver)


def test_rejects_when_any_record_is_private():
    """A mixed answer must not be salvaged by its one public address."""
    resolver = resolver_for({"mixed.example.com": ["93.184.216.34", "127.0.0.1"]})
    with pytest.raises(UrlDownloadError):
        validate_public_http_url("http://mixed.example.com/x.pdf", resolver=resolver)


def test_rejects_unresolvable_hostname():
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url("http://nope.example.com/x.pdf", resolver=resolver_for({}))
    assert exc.value.reason == "blocked_url"


def test_rejects_hostname_with_no_addresses():
    with pytest.raises(UrlDownloadError) as exc:
        validate_public_http_url("http://empty.example.com/x.pdf", resolver=resolver_for({"empty.example.com": []}))
    assert exc.value.reason == "blocked_url"


# ──────────────────────────── download: redirects ────────────────────────────


def test_follows_redirect_and_revalidates():
    session = FakeSession(
        FakeResponse(302, {"Location": "https://other.example.com/real.pdf"}),
        pdf_response(),
    )
    tmpfile, content_type = download_pdf_to_tempfile(
        "http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER
    )
    with tmpfile:
        assert tmpfile.read() == PDF_BYTES
    assert content_type == "application/pdf"
    assert session.requested_urls == ["http://public.example.com/x.pdf", "https://other.example.com/real.pdf"]


def test_redirect_to_private_host_is_blocked_at_that_hop():
    session = FakeSession(FakeResponse(302, {"Location": "http://169.254.169.254/latest/meta-data"}))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "blocked_url"


def test_redirect_to_internal_port_is_blocked():
    session = FakeSession(FakeResponse(302, {"Location": "http://public.example.com:9200/x.pdf"}))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "blocked_url"


def test_relative_redirect_location_is_resolved():
    session = FakeSession(FakeResponse(302, {"Location": "/elsewhere/real.pdf"}), pdf_response())
    tmpfile, _ = download_pdf_to_tempfile(
        "http://public.example.com/docs/x.pdf", session=session, resolver=PUBLIC_RESOLVER
    )
    tmpfile.close()
    assert session.requested_urls[1] == "http://public.example.com/elsewhere/real.pdf"


def test_redirect_loop_gives_up():
    hops = [FakeResponse(302, {"Location": "http://public.example.com/next.pdf"}) for _ in range(6)]
    session = FakeSession(*hops)
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "too_many_redirects"


# ──────────────────────────── download: size cap ────────────────────────────


def test_rejects_declared_content_length_over_cap():
    session = FakeSession(pdf_response(**{"Content-Length": str(MAX_PDF_BYTES + 1)}))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "too_large"


def test_aborts_body_that_streams_past_cap():
    """A lying or absent Content-Length must not get past the streaming cap."""
    body = b"%PDF-" + b"a" * 60
    session = FakeSession(pdf_response(body=body))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile(
            "http://public.example.com/x.pdf", session=session, max_bytes=32, resolver=PUBLIC_RESOLVER
        )
    assert exc.value.reason == "too_large"


def test_accepts_body_exactly_at_cap():
    body = b"%PDF-" + b"a" * 27  # 32 bytes
    session = FakeSession(pdf_response(body=body))
    tmpfile, _ = download_pdf_to_tempfile(
        "http://public.example.com/x.pdf", session=session, max_bytes=32, resolver=PUBLIC_RESOLVER
    )
    with tmpfile:
        assert tmpfile.read() == body


def test_unparseable_content_length_falls_through_to_streaming_cap():
    session = FakeSession(pdf_response(**{"Content-Length": "banana"}))
    tmpfile, _ = download_pdf_to_tempfile(
        "http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER
    )
    tmpfile.close()


# ──────────────────────────── download: content type ────────────────────────────


def test_html_served_from_a_pdf_url_is_not_a_pdf():
    session = FakeSession(pdf_response(body=b"<!DOCTYPE html><html>", content_type="text/html"))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "not_a_pdf"


def test_pdf_magic_wins_over_odd_content_type():
    session = FakeSession(pdf_response(content_type="application/octet-stream"))
    tmpfile, _ = download_pdf_to_tempfile(
        "http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER
    )
    tmpfile.close()


def test_pdf_content_type_wins_over_odd_magic():
    session = FakeSession(pdf_response(body=b"\x00\x01\x02\x03\x04rest", content_type="application/pdf"))
    tmpfile, _ = download_pdf_to_tempfile(
        "http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER
    )
    tmpfile.close()


# ──────────────────────────── download: HTTP + network errors ────────────────────────────


@pytest.mark.parametrize("status", [400, 401, 403, 404, 410, 429, 500, 503])
def test_http_errors_carry_their_status_in_the_reason(status):
    session = FakeSession(FakeResponse(status, {}, b""))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == f"http_{status}"


def test_redirect_without_location_is_a_network_error():
    session = FakeSession(FakeResponse(302, {}, b""))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "network"


def test_connection_error_while_streaming_is_a_network_error():
    session = FakeSession(FakeResponse(200, {"Content-Type": "application/pdf"}, b"%PDF-" * 10, chunk_size=5,
                                       raise_after=2))
    with pytest.raises(UrlDownloadError) as exc:
        download_pdf_to_tempfile("http://public.example.com/x.pdf", session=session, resolver=PUBLIC_RESOLVER)
    assert exc.value.reason == "network"


def test_error_message_shape_is_what_documents_failed_records():
    error = UrlDownloadError("http_404", "fetching http://x/y.pdf")
    assert error.as_error_message() == "PDF fetch failed (http_404): fetching http://x/y.pdf"


# ──────────────────────────── retry classification ────────────────────────────


@pytest.mark.parametrize(
    "error",
    [
        "PDF fetch failed (blocked_url): ...",
        "PDF fetch failed (too_large): ...",
        "PDF fetch failed (too_many_redirects): ...",
        "PDF fetch failed (http_404): ...",
        "PDF fetch failed (http_403): ...",
        "No text detected in image",
    ],
)
def test_non_retryable_errors(error):
    assert is_non_retryable(error)


@pytest.mark.parametrize(
    "error",
    [
        "PDF fetch failed (http_408): ...",  # request timeout — retrying helps
        "PDF fetch failed (http_429): ...",  # rate limited — retrying helps
        "PDF fetch failed (http_503): ...",
        "PDF fetch failed (network): ConnectionError",
        "some unrelated ingest failure",
        "",
        None,
    ],
)
def test_retryable_errors(error):
    assert not is_non_retryable(error)


# ──────────────────────────── filenames and keys ────────────────────────────


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://x.edu/docs/Student%20Handbook.pdf", "Student-Handbook.pdf"),
        ("https://x.edu/docs/REPORT.PDF", "REPORT.pdf"),
        ("https://x.edu/docs/handbook.pdf?version=2&dl=1", "handbook.pdf"),
        ("https://x.edu/docs/handbook.pdf#page=4", "handbook.pdf"),
        ("https://x.edu/docs/no-extension", "no-extension.pdf"),
        ("https://x.edu/docs/a__b--c.pdf", "a-b-c.pdf"),
        ("https://x.edu/", "document.pdf"),
        ("https://x.edu", "document.pdf"),
        ("https://x.edu/docs/---.pdf", "document.pdf"),
    ],
)
def test_sanitize_pdf_filename(url, expected):
    assert sanitize_pdf_filename(url) == expected


def test_long_filenames_are_capped():
    name = sanitize_pdf_filename("https://x.edu/" + "a" * 300 + ".pdf")
    assert len(name) <= 200
    assert name.endswith(".pdf")


def test_build_crawl_pdf_key_shape_matches_the_duplicate_check():
    key, readable = build_crawl_pdf_key("CS 101", "https://x.edu/docs/Student%20Handbook.pdf")
    assert readable == "Student-Handbook.pdf"
    assert re.fullmatch(
        r"courses/CS 101/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-Student-Handbook\.pdf",
        key,
    )
    # ingest.py's check_for_duplicates strips a 37-char UUID prefix off the basename
    # and LIKE-matches the remainder; a bare `{uuid}.pdf` would leave nothing to match.
    assert key.rsplit("/", 1)[1][37:] == readable


def test_build_crawl_pdf_key_is_unique_per_call():
    a, _ = build_crawl_pdf_key("CS 101", "https://x.edu/a.pdf")
    b, _ = build_crawl_pdf_key("CS 101", "https://x.edu/a.pdf")
    assert a != b
