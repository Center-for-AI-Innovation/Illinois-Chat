"""Bearer-token check shared by the backend's /ingest route and rabbitmq/bridge.py.

Both sides are reduced to a fixed-length sha256 digest before the constant-time
compare. `hmac.compare_digest` already returns False (rather than raising) when
two ASCII strings differ in length, but it raises `TypeError` for `str` input
containing non-ASCII characters, so a header such as `Bearer é` would turn into
a 500 instead of a 401. Hashing the UTF-8 bytes first sidesteps that and keeps
the comparison independent of the token's length, mirroring the crawler's
`apps/crawlee/src/api/auth.ts`.
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Optional


def _sha256(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


def ingest_request_is_authorized(authorization_header: Optional[str], expected_key: Optional[str]) -> bool:
    """True when the request may hit /ingest.

    Fails open when `expected_key` is unset so an existing deployment keeps working
    after an upgrade; once every caller sends the header, set INGEST_API_KEY.
    """
    if not expected_key:
        return True
    presented = authorization_header or ""
    return hmac.compare_digest(_sha256(presented), _sha256(f"Bearer {expected_key}"))
