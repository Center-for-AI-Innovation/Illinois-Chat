"""
Tests for the export error helpers in ``ai_ta_backend.main`` (issue #354):
an "Error ..." string in ``response`` becomes a 500 JSON reply.
"""

from __future__ import annotations

import pytest

from ai_ta_backend import main


@pytest.mark.parametrize("status, expected", [
    ({"response": "Error fetching conversations"}, True),
    ({"response": "Download from S3", "s3_path": "x"}, False),
    ({"response": None}, False),
    ({}, False),
])
def test_is_export_error(status, expected):
    assert main._is_export_error(status) is expected


def test_export_error_response_is_500_json():
    with main.app.test_request_context():
        response = main._export_error_response({"response": "Error fetching conversations", "extra": 1})
    assert response.status_code == 500
    assert response.get_json() == {"response": "Error fetching conversations"}
    assert response.headers["Access-Control-Allow-Origin"] == "*"
