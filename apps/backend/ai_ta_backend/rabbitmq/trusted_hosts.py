"""Guards for server-side secrets that must only be sent to env-configured
hosts, never to a URL a project admin supplied.

This is the canonical copy: the standalone worker image only ships the
rabbitmq/ directory, so ai_ta_backend/utils/trusted_hosts.py re-exports it."""

from typing import Iterable, Optional
from urllib.parse import urlsplit


def _origin(url: Optional[str]) -> Optional[tuple]:
    if not url:
        return None
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if not parts.scheme or not parts.hostname:
        return None
    scheme = parts.scheme.lower()
    if port is None:
        port = {"http": 80, "https": 443}.get(scheme)
    return (scheme, parts.hostname.lower(), port)


def is_same_origin_as_any(url: Optional[str], trusted_urls: Iterable[Optional[str]]) -> bool:
    """True when ``url`` has the same scheme/host/port as one of ``trusted_urls``."""
    origin = _origin(url)
    if origin is None:
        return False
    return any(_origin(t) == origin for t in trusted_urls)
