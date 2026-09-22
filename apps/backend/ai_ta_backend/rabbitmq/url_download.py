"""Fetch a PDF from a public URL, safely.

Used by the ingest worker when a job carries `fetch_from_url: true` (crawled PDFs).
The crawler reports only the URL; the worker downloads it here and uploads it to the
bucket it already resolved for the project, so the writer and the reader of the
object are the same process.

Self-contained within rabbitmq/ (stdlib + requests only) because the worker Docker
image copies only this directory, and so the SSRF/sanitising logic can be unit-tested
without importing ingest.py's heavy dependencies (fitz, pytesseract, langchain).
"""

import ipaddress
import logging
import re
import socket
import uuid
from pathlib import PurePosixPath
from tempfile import NamedTemporaryFile
from typing import Callable, Optional, Tuple
from urllib.parse import unquote, urljoin, urlparse

import requests

MAX_PDF_BYTES = 200 * 1024 * 1024  # 200 MiB
MAX_REDIRECTS = 5
CHUNK_SIZE = 1024 * 1024  # 1 MiB
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 60
USER_AGENT = "illinois-chat-ingest/1.0"
ALLOWED_PORTS = frozenset({80, 443})
MAX_FILENAME_LENGTH = 200
DEFAULT_FILENAME = "document.pdf"

PDF_FETCH_ERROR_PREFIX = "PDF fetch failed"

# Errors that will not change on a retry. `main_ingest` checks these ONCE, before
# its retry loop, so a deterministic failure costs one attempt instead of three.
# 408 (Request Timeout) and 429 (Too Many Requests) are deliberately absent: those
# are the two 4xx codes where retrying actually helps.
NON_RETRYABLE_ERROR_MARKERS = (
    "No text detected in image",
    f"{PDF_FETCH_ERROR_PREFIX} (blocked_url",
    f"{PDF_FETCH_ERROR_PREFIX} (too_large",
    f"{PDF_FETCH_ERROR_PREFIX} (too_many_redirects",
    f"{PDF_FETCH_ERROR_PREFIX} (http_400",
    f"{PDF_FETCH_ERROR_PREFIX} (http_401",
    f"{PDF_FETCH_ERROR_PREFIX} (http_403",
    f"{PDF_FETCH_ERROR_PREFIX} (http_404",
    f"{PDF_FETCH_ERROR_PREFIX} (http_405",
    f"{PDF_FETCH_ERROR_PREFIX} (http_410",
    f"{PDF_FETCH_ERROR_PREFIX} (http_451",
)

_BLOCKED_HOSTNAMES = frozenset({"localhost"})
_BLOCKED_HOSTNAME_SUFFIXES = (".internal", ".local", ".localhost")


class UrlDownloadError(Exception):
    """A PDF fetch that failed for a known, reportable reason."""

    def __init__(self, reason: str, detail: str = ""):
        self.reason = reason
        self.detail = detail
        super().__init__(f"{reason}: {detail}" if detail else reason)

    def as_error_message(self) -> str:
        """The string recorded on `documents_failed` (matched by NON_RETRYABLE_ERROR_MARKERS)."""
        return f"{PDF_FETCH_ERROR_PREFIX} ({self.reason}): {self.detail}"


def is_non_retryable(error: object) -> bool:
    """True when retrying this error cannot change the outcome."""
    text = str(error or "")
    return any(marker in text for marker in NON_RETRYABLE_ERROR_MARKERS)


def _is_public_address(raw_address: str) -> bool:
    try:
        address = ipaddress.ip_address(raw_address)
    except ValueError:
        return False

    # ::ffff:127.0.0.1 is an IPv6 object that is NOT caught by the IPv6 private
    # ranges, so unwrap the embedded IPv4 address before testing.
    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        address = mapped

    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def validate_public_http_url(url: str, *, resolver: Callable = socket.getaddrinfo) -> None:
    """Raise UrlDownloadError('blocked_url') unless `url` is a public http(s) URL.

    The worker fetches URLs supplied over the network, so this is the primary
    defense against pointing it at internal services or cloud metadata.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise UrlDownloadError("blocked_url", f"unsupported scheme '{parsed.scheme}' in {url}")

    # Credentials in the URL are never legitimate here and can smuggle a host.
    if parsed.username or parsed.password:
        raise UrlDownloadError("blocked_url", "URL contains embedded credentials")

    try:
        port = parsed.port
    except ValueError as exc:  # malformed port
        raise UrlDownloadError("blocked_url", f"invalid port in {url}") from exc

    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    if port not in ALLOWED_PORTS:
        # An allow-list, not a deny-list: without it, any resolvable host on
        # :9200 / :6379 / :2375 would sail through the address checks below.
        raise UrlDownloadError("blocked_url", f"port {port} is not allowed (only 80 and 443)")

    hostname = (parsed.hostname or "").strip().rstrip(".").lower()
    if not hostname:
        raise UrlDownloadError("blocked_url", f"no hostname in {url}")
    if hostname in _BLOCKED_HOSTNAMES or hostname.endswith(_BLOCKED_HOSTNAME_SUFFIXES):
        raise UrlDownloadError("blocked_url", f"hostname '{hostname}' is not a public host")

    try:
        addr_info = resolver(hostname, port)
    except Exception as exc:  # NXDOMAIN, resolver failure
        raise UrlDownloadError("blocked_url", f"could not resolve '{hostname}': {exc}") from exc

    addresses = [info[4][0] for info in addr_info if info and len(info) >= 5 and info[4]]
    if not addresses:
        raise UrlDownloadError("blocked_url", f"'{hostname}' resolved to no addresses")

    for address in addresses:
        if not _is_public_address(address):
            raise UrlDownloadError("blocked_url", f"'{hostname}' resolves to non-public address {address}")


def _looks_like_pdf(head: bytes, content_type: str) -> bool:
    return head[:5] == b"%PDF-" or "application/pdf" in (content_type or "").lower()


def download_pdf_to_tempfile(
    url: str,
    *,
    session: Optional[requests.Session] = None,
    max_bytes: int = MAX_PDF_BYTES,
    resolver: Callable = socket.getaddrinfo,
) -> Tuple[NamedTemporaryFile, str]:
    """Download `url` into a temp file, enforcing the SSRF guard and the size cap.

    Returns (tempfile positioned at 0, content_type). The caller owns the file and
    must close it. Raises UrlDownloadError for every expected failure mode.
    """
    http = session or requests.Session()
    current_url = url

    for _ in range(MAX_REDIRECTS + 1):
        validate_public_http_url(current_url, resolver=resolver)

        try:
            response = http.get(
                current_url,
                stream=True,
                allow_redirects=False,  # each hop is re-validated by hand
                timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                headers={"User-Agent": USER_AGENT},
            )
        except requests.RequestException as exc:
            raise UrlDownloadError("network", f"{type(exc).__name__} fetching {current_url}") from exc

        with response:
            if response.is_redirect or response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("Location")
                if not location:
                    raise UrlDownloadError("network", f"redirect without Location from {current_url}")
                current_url = urljoin(current_url, location)
                continue

            if response.status_code >= 400:
                raise UrlDownloadError(f"http_{response.status_code}", f"fetching {current_url}")

            content_type = response.headers.get("Content-Type", "")

            declared_length = response.headers.get("Content-Length")
            if declared_length:
                try:
                    if int(declared_length) > max_bytes:
                        raise UrlDownloadError(
                            "too_large",
                            f"Content-Length {declared_length} exceeds {max_bytes} bytes",
                        )
                except ValueError:
                    pass  # unparseable header; the streaming cap below still applies

            tmpfile = NamedTemporaryFile(suffix=".pdf")
            total = 0
            head = b""
            try:
                for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > max_bytes:
                        raise UrlDownloadError("too_large", f"body exceeded {max_bytes} bytes")
                    if len(head) < 5:
                        head += chunk[: 5 - len(head)]
                    tmpfile.write(chunk)

                if not _looks_like_pdf(head, content_type):
                    raise UrlDownloadError(
                        "not_a_pdf",
                        f"content-type={content_type or 'n/a'} for {current_url}",
                    )

                tmpfile.flush()
                tmpfile.seek(0)
                return tmpfile, content_type
            except requests.RequestException as exc:
                tmpfile.close()
                raise UrlDownloadError("network", f"{type(exc).__name__} reading {current_url}") from exc
            except BaseException:
                tmpfile.close()
                raise

    raise UrlDownloadError("too_many_redirects", f"more than {MAX_REDIRECTS} redirects from {url}")


def sanitize_pdf_filename(url: str) -> str:
    """Derive a safe, readable `.pdf` filename from a URL.

    Uses the URL *path* so query strings never leak into the name. Mirrors the
    crawler's TypeScript `sanitizePdfFilename` — both are covered by the same fixtures.
    """
    try:
        path = urlparse(url).path
    except ValueError:
        path = ""

    raw_name = unquote(PurePosixPath(path).name) if path else ""
    stem = PurePosixPath(raw_name).stem if raw_name else ""

    stem = re.sub(r"[^a-zA-Z0-9]", "-", stem)
    stem = re.sub(r"-+", "-", stem).strip("-")

    if not stem:
        return DEFAULT_FILENAME

    stem = stem[: MAX_FILENAME_LENGTH - len(".pdf")]
    return f"{stem}.pdf"


def build_crawl_pdf_key(course_name: str, url: str) -> Tuple[str, str]:
    """Return (s3_key, readable_filename) for a crawled PDF.

    The `{uuid}-{name}.pdf` shape matches the frontend's upload convention and the
    worker's duplicate check, which strips a 37-character UUID prefix and matches on
    what remains — a bare `{uuid}.pdf` would leave nothing to match on.
    """
    readable_filename = sanitize_pdf_filename(url)
    s3_key = f"courses/{course_name}/{uuid.uuid4()}-{readable_filename}"
    return s3_key, readable_filename
