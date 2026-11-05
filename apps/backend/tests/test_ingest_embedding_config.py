from types import SimpleNamespace
from unittest.mock import MagicMock

from ai_ta_backend.rabbitmq import ingest as ingest_module


def test_bad_embedding_config_is_recorded_as_failed_document(monkeypatch):
    sql = MagicMock()
    monkeypatch.setattr(ingest_module, "SQLAlchemyIngestDB", lambda engine=None: sql)
    rc = SimpleNamespace(
        embedding_provider="openai",
        embedding_api_base="https://x.example/v1",
        embedding_api_key=None,
    )

    result = ingest_module.Ingest().main_ingest(
        job_id="job-1",
        _resolved_connections=rc,
        course_name="proj",
        s3_paths="courses/proj/a.pdf",
        readable_filename="a.pdf",
    )

    assert "api_key is required" in result
    failed = sql.insert_failed_document.call_args.args[0]
    assert failed["course_name"] == "proj"
    assert failed["readable_filename"] == "a.pdf"
    assert "api_key is required" in failed["error"]
    sql.delete_document_in_progress.assert_called_once_with("job-1")
