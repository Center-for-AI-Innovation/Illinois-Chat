"""Unit tests for the shared /ingest bearer-token check (`rabbitmq/ingest_auth.py`).

The point of hashing both sides before `hmac.compare_digest` is that no shape of
`Authorization` header can make the check raise: a malformed token must be a
401, never a 500. These tests pin that down for the cases a reviewer called out
(missing header, short token) plus the one that actually raises with plain
`str` comparison (non-ASCII input).
"""

from __future__ import annotations

import pytest

from ai_ta_backend.rabbitmq.ingest_auth import ingest_request_is_authorized

KEY = "s3cret-ingest-key"


def test_exact_bearer_token_is_accepted():
    assert ingest_request_is_authorized(f"Bearer {KEY}", KEY) is True


@pytest.mark.parametrize(
    "header",
    [
        None,  # header absent
        "",  # header present but empty
        "Bearer x",  # much shorter than the expected value
        "Bearer " + KEY + "-and-then-some",  # longer than the expected value
        KEY,  # missing the "Bearer " prefix
        f"bearer {KEY}",  # scheme is case-sensitive
        "Bearer é",  # non-ASCII: str compare_digest would raise TypeError here
        "Bearer " + KEY[:-1] + "é",  # non-ASCII at the same length as the real token
    ],
)
def test_bad_or_missing_tokens_are_rejected_without_raising(header):
    assert ingest_request_is_authorized(header, KEY) is False


def test_fails_open_when_no_key_is_configured():
    assert ingest_request_is_authorized(None, None) is True
    assert ingest_request_is_authorized("Bearer whatever", "") is True
