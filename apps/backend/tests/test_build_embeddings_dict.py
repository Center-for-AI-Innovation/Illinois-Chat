import pytest

from ai_ta_backend.rabbitmq.embeddings import build_embeddings_dict


def _ok(text, vec):
    return [{"input": text, "model": "m"}, {"data": [{"embedding": vec}]}]


def test_skips_none_entries_from_retried_attempts():
    inputs = [{"input": "a", "model": "m"}, {"input": "b", "model": "m"}]
    # "b" failed once (None), then succeeded on retry.
    results = [_ok("a", [1.0]), None, _ok("b", [2.0])]

    assert build_embeddings_dict(results, inputs) == {"a": [1.0], "b": [2.0]}


def test_raises_clear_error_when_request_exhausts_retries():
    inputs = [{"input": "a", "model": "m"}, {"input": "b", "model": "m"}]
    results = [_ok("a", [1.0]), None, [{"input": "b", "model": "m"}, ["HTTP 503"]]]

    with pytest.raises(RuntimeError, match=r"1 of 2 chunks.*HTTP 503"):
        build_embeddings_dict(results, inputs)
