"""
Tests for ``install_request_logging`` in ``ai_ta_backend.rabbitmq.log_setup`` (issue #354).

Coverage: the X-Request-ID header is echoed when safe and minted otherwise; one
request line per request, none for /health and OPTIONS preflights; the request
teardown clears the log context; an uncaught exception still gives a
``status=500`` request line and the response header.
"""

from __future__ import annotations

import logging

import pytest
from flask import Flask

from ai_ta_backend.rabbitmq.log_setup import bind, clear, current_context, current_rid, install_request_logging

APP_NAME = "request_logging_test"


@pytest.fixture(autouse=True)
def _clean_context():
    clear()
    yield
    clear()


@pytest.fixture
def client():
    app = Flask(APP_NAME)
    install_request_logging(app)

    @app.route("/work", methods=["GET", "POST"])
    def work():
        bind(course="ece120")
        return {"rid": current_rid()}

    @app.route("/health")
    def health():
        return "ok"

    @app.route("/boom")
    def boom():
        raise RuntimeError("boom")

    return app.test_client()


def request_lines(caplog):
    return [r.getMessage() for r in caplog.records if r.name == APP_NAME and r.getMessage().startswith("request ")]


def test_safe_incoming_id_is_used_and_echoed(client, caplog):
    caplog.set_level(logging.INFO)
    response = client.get("/work", headers={"X-Request-ID": "abc-123"})
    assert response.headers["X-Request-ID"] == "abc-123"
    assert response.get_json()["rid"] == "abc-123"
    lines = request_lines(caplog)
    assert len(lines) == 1
    assert lines[0].startswith("request method=GET route=/work status=200 ms=")


@pytest.mark.parametrize("headers", [{}, {"X-Request-ID": "has space"}, {"X-Request-ID": "a" * 65}])
def test_missing_or_unsafe_id_is_replaced(client, headers):
    response = client.get("/work", headers=headers)
    rid = response.headers["X-Request-ID"]
    assert rid != headers.get("X-Request-ID")
    assert len(rid) == 12
    assert response.get_json()["rid"] == rid


def test_health_is_not_logged(client, caplog):
    caplog.set_level(logging.INFO)
    response = client.get("/health")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert request_lines(caplog) == []


def test_options_preflight_is_not_logged(client, caplog):
    caplog.set_level(logging.INFO)
    response = client.options("/work")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert request_lines(caplog) == []


def test_teardown_clears_the_context(client):
    client.get("/work", headers={"X-Request-ID": "tear1"})
    assert current_context() == {}


def test_uncaught_exception_logs_status_500_and_sets_header(client, caplog):
    caplog.set_level(logging.INFO)
    response = client.get("/boom", headers={"X-Request-ID": "boom1"})
    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "boom1"
    lines = request_lines(caplog)
    assert len(lines) == 1
    assert lines[0].startswith("request method=GET route=/boom status=500 ")
    assert current_context() == {}
