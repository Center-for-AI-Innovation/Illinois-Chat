import pytest

from ai_ta_backend.rabbitmq import trusted_hosts as worker_trusted_hosts
from ai_ta_backend.utils import trusted_hosts


@pytest.mark.parametrize("mod", [trusted_hosts, worker_trusted_hosts])
@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://ncsa.example/api/chat", True),
        ("https://NCSA.example:443/x", True),
        ("http://ncsa.example", False),
        ("https://ncsa.example:8443", False),
        ("https://ncsa.example.attacker.example", False),
        ("https://ncsa.example@attacker.example", False),
        ("not a url", False),
        ("", False),
        (None, False),
    ],
)
def test_is_same_origin_as_any(mod, url, expected):
    assert mod.is_same_origin_as_any(url, ["https://ncsa.example"]) is expected


def test_unset_trusted_url_never_matches():
    assert trusted_hosts.is_same_origin_as_any("https://x.example", [None, ""]) is False
