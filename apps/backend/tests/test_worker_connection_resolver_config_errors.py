"""
Tests for a stored connection that cannot be used, in the worker's
``WorkerConnectionResolver``.

A field of a project's connection row (``database_config``, ``qdrant_config``,
``s3_config``, ``embedding_config``) that is present but cannot be decrypted or
built makes ``resolve()`` and ``resolve_documents_engine()`` raise
``ConnectionConfigError``. The job must never run on the host's shared
resources instead. The error names the project and the field, never the config,
and carries no chained error: the text of a decrypt, JSON or driver error, and
the frames under the resolver, can hold the decrypted config.

The blobs here are encrypted for real with a test key, so the decrypt path is
the one the worker runs.
"""

from __future__ import annotations

import json
import logging
import pickle
import traceback

import pytest

from ai_ta_backend.rabbitmq import connection_resolver as cr
from ai_ta_backend.utils.crypto import encrypt

PROJECT = "demo"
KEY = "MARKER-key"
OTHER_KEY = "MARKER-other-key"
# Planted in every config: it must never reach an error text, a log record or a frame of the traceback.
MARKER = "MARKER-secret"
FIELDS = ["database_config", "qdrant_config", "s3_config", "embedding_config"]
GOOD = {
    "database_config": {"connection_uri": "postgresql://ext:" + MARKER + "@db.example.edu:5432/docs"},
    "qdrant_config": {"url": "http://127.0.0.1:9", "api_key": MARKER, "port": 6333, "default_collection": "c"},
    "s3_config": {"aws_access_key_id": "ext", "aws_secret_access_key": MARKER, "bucket_name": "b"},
    "embedding_config": {"provider": "openai", "model": "m", "api_key": MARKER, "api_base": "http://127.0.0.1:9/v1"},
}


class _SqlStub:

    def __init__(self, rows):
        self._rows = rows

    def getExternalConnection(self, project_name):
        return self._rows.get(project_name)


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("ENCRYPTION_MASTER_KEY", KEY)


def envelope(value, key=KEY):
    """A column value as the frontend stores it."""
    return {"encrypted": encrypt(json.dumps(value), key)}


def corrupted(value):
    """A real envelope whose ciphertext was changed, so its tag no longer matches."""
    version, body, iv = envelope(value)["encrypted"].split(".")
    body = ("A" if body[0] != "A" else "B") + body[1:]
    return {"encrypted": ".".join([version, body, iv])}


def resolver(row):
    return cr.WorkerConnectionResolver(_SqlStub({PROJECT: row}))


def message(field, cause):
    return "the connection %s of project %s cannot be used (%s)" % (field, PROJECT, cause)


def assert_clean(error, caplog):
    """The error is a ValueError with no chained error and no secret; the resolver logged nothing at WARNING+."""
    assert isinstance(error, ValueError)
    assert error.__cause__ is None and error.__suppress_context__
    # Not even an implicit context: the decrypt or JSON error it replaces quotes the stored blob.
    assert error.__context__ is None
    assert MARKER not in str(error) and MARKER not in repr(error)
    # No frame of the resolver holds the config (Sentry sends frame locals): the public method's
    # frame is the only one, and it no longer holds the stored row.
    frames = [frame for frame, _ in traceback.walk_tb(error.__traceback__) if frame.f_code.co_filename == cr.__file__]
    assert [frame.f_code.co_name for frame in frames] in (["resolve"], ["resolve_documents_engine"])
    assert frames[0].f_locals["config"] is None
    logging.getLogger("test").error("resolve failed", exc_info=error)
    assert MARKER not in caplog.text
    # The caller logs the error once; the resolver adds nothing at WARNING or above.
    assert [r for r in caplog.records if r.levelno >= logging.WARNING and r.name == cr.logger.name] == []


def resolve_error(row, caplog, call="resolve"):
    caplog.set_level(logging.DEBUG)
    with pytest.raises(cr.ConnectionConfigError) as raised:
        getattr(resolver(row), call)(PROJECT)
    assert_clean(raised.value, caplog)
    return raised.value


# ── A value that cannot be decrypted, or that is not a usable JSON object ──

UNUSABLE = {
    # how: (column value builder, cause)
    "a corrupted blob": (lambda field: corrupted(GOOD[field]), "InvalidTag"),
    "another key": (lambda field: envelope(GOOD[field], OTHER_KEY), "InvalidTag"),
    "an empty object": (lambda field: envelope({}), "empty"),
    "null": (lambda field: envelope(None), "not a JSON object"),
    "a list": (lambda field: envelope([MARKER]), "not a JSON object"),
    "a string": (lambda field: envelope(MARKER), "not a JSON object"),
    "text that is not JSON": (lambda field: {"encrypted": encrypt("not json " + MARKER, KEY)}, "JSONDecodeError"),
    # The version is read from the stored blob, so it is not repeated in the text.
    "an unknown envelope version": (lambda field: {"encrypted": "v2." + MARKER + ".AAAA"}, "ValueError"),
    "a bare string in place of the envelope": (lambda field: "v1." + MARKER + ".AAAA", "TypeError"),
    "a truncated blob": (lambda field: {"encrypted": envelope(GOOD[field])["encrypted"][:-3]}, "binascii.Error"),
}


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("how", list(UNUSABLE))
def test_a_value_that_cannot_be_used_names_the_project_and_the_field(field, how, caplog):
    build, cause = UNUSABLE[how]
    error = resolve_error({field: build(field)}, caplog)
    assert (error.project_name, error.field, error.cause) == (PROJECT, field, cause)
    assert str(error) == message(field, cause)
    assert "Unsupported" not in str(error)


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("unset", ["absent", "empty"])
def test_a_blob_with_no_key_set_names_the_key(field, unset, monkeypatch, caplog):
    if unset == "absent":
        monkeypatch.delenv("ENCRYPTION_MASTER_KEY")
    else:
        monkeypatch.setenv("ENCRYPTION_MASTER_KEY", "")
    error = resolve_error({field: envelope(GOOD[field])}, caplog)
    assert str(error) == message(field, "ENCRYPTION_MASTER_KEY is not set")


@pytest.mark.parametrize("how", list(UNUSABLE))
def test_documents_engine_alone_fails_the_same_way(how, caplog):
    build, cause = UNUSABLE[how]
    error = resolve_error({"database_config": build("database_config")}, caplog, call="resolve_documents_engine")
    assert str(error) == message("database_config", cause)


INNER_CALLS = {
    "_resolve": lambda r, row: r._resolve(PROJECT, row),
    "_documents_engine": lambda r, row: r._documents_engine(PROJECT, row),
    "_decrypt_field": lambda r, row: r._decrypt_field(row, PROJECT, "database_config"),
}


@pytest.mark.parametrize("call, how", [
    ("_resolve", "corrupted"), ("_documents_engine", "corrupted"),
    ("_resolve", "no key"), ("_documents_engine", "no key"), ("_decrypt_field", "no key"),
])
def test_the_inner_raises_have_no_chained_error(call, how, monkeypatch):
    """The public methods raise a fresh error, so this checks the raises under them on their own."""
    row = {"database_config": corrupted(GOOD["database_config"]) if how == "corrupted" else
           envelope(GOOD["database_config"])}
    if how == "no key":
        monkeypatch.delenv("ENCRYPTION_MASTER_KEY")
    with pytest.raises(cr.ConnectionConfigError) as raised:
        INNER_CALLS[call](resolver(row), row)
    assert raised.value.cause == ("InvalidTag" if how == "corrupted" else "ENCRYPTION_MASTER_KEY is not set")
    assert raised.value.__cause__ is None and raised.value.__suppress_context__


# ── No value: the project uses the host's connection for that field ──

@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("value", [None, {}, {"encrypted": None}, {"encrypted": ""}, {"other": "x"}])
def test_no_value_or_an_envelope_with_nothing_encrypted_is_no_override(field, value, monkeypatch, caplog):
    # Also with no key: nothing has to be decrypted.
    monkeypatch.delenv("ENCRYPTION_MASTER_KEY")
    caplog.set_level(logging.DEBUG)
    result = resolver({field: value}).resolve(PROJECT)
    assert result.has_overrides is False and result.engine_kind == "pgvector"
    assert resolver({field: value}).resolve_documents_engine(PROJECT) is None
    assert [r for r in caplog.records if r.levelno >= logging.WARNING] == []


def test_no_row_is_no_override():
    assert resolver(None).resolve(PROJECT).has_overrides is False


def test_all_four_fields_resolve_when_they_can_be_used():
    result = resolver({field: envelope(GOOD[field]) for field in FIELDS}).resolve(PROJECT)
    assert result.engine_kind == "qdrant" and result.qdrant_collection_name == "c"
    assert result.documents_sql_engine.url.host == "db.example.edu"
    assert result.s3_bucket_name == "b" and result.s3_client is not None
    assert (result.embedding_provider, result.embedding_model) == ("openai", "m")


def test_a_broken_embedding_column_is_not_hidden_by_a_good_legacy_block(caplog):
    legacy = dict(GOOD["qdrant_config"], embedding=GOOD["embedding_config"])
    error = resolve_error({"qdrant_config": envelope(legacy), "embedding_config": corrupted({"x": 1})}, caplog)
    assert (error.field, error.cause) == ("embedding_config", "InvalidTag")


def test_a_good_embedding_column_wins_over_a_broken_legacy_block():
    legacy = dict(GOOD["qdrant_config"], embedding=MARKER)
    result = resolver({"qdrant_config": envelope(legacy),
                       "embedding_config": envelope(GOOD["embedding_config"])}).resolve(PROJECT)
    assert result.embedding_model == "m"


# ── A value that decrypts but that the builder cannot use ──

def without(field, key):
    return {k: v for k, v in GOOD[field].items() if k != key}


BROKEN = [
    # (field, decrypted value, cause, message or None for the standard one)
    ("qdrant_config", without("qdrant_config", "port"), "KeyError", None),
    ("qdrant_config", dict(GOOD["qdrant_config"], port="no-port"), "ValueError", None),
    ("qdrant_config", dict(GOOD["qdrant_config"], embedding=MARKER), "AttributeError", None),
    ("s3_config", without("s3_config", "aws_secret_access_key"), "KeyError", None),
    ("s3_config", dict(GOOD["s3_config"], endpoint_url="http://[" + MARKER), "ValueError", None),
    ("database_config", {"password": MARKER}, "KeyError", None),
    ("database_config", {"connection_uri": "mysql://ext:" + MARKER + "@db.example.edu/docs"}, "ModuleNotFoundError",
     None),
    ("database_config", {"connection_uri": "postgresql+asyncpg://ext:" + MARKER + "@db.example.edu/docs"},
     "ModuleNotFoundError", None),
    # The texts of the documents-engine builder are kept word for word.
    ("database_config", {"connection_uri": "postgres://ext:" + MARKER + "@db.example.edu:5432/docs"},
     "NoSuchModuleError", "the connection_uri of project demo has the scheme postgres://, which the backend cannot "
     "use; use postgresql://"),
    ("database_config", {"connection_uri": "postgresql://ext:p@ss:" + MARKER + "@db.example.edu:5432/docs"},
     "ValueError", "the connection_uri of project demo is not a valid database URL"),
    ("database_config", {"connection_uri": "postgresql+psycopg2 ext:" + MARKER + "@db.example.edu/docs"},
     "ArgumentError", "the connection_uri of project demo is not a valid database URL"),
]


@pytest.mark.parametrize("field, value, cause, text", BROKEN, ids=lambda v: v if isinstance(v, str) else "")
def test_a_value_the_builder_cannot_use_names_the_field(field, value, cause, text, caplog):
    error = resolve_error({field: envelope(value)}, caplog)
    assert (error.project_name, error.field, error.cause) == (PROJECT, field, cause)
    assert str(error) == (text or message(field, cause))


@pytest.mark.parametrize("field, value, cause, text", [b for b in BROKEN if b[0] == "database_config"],
                         ids=lambda v: v if isinstance(v, str) else "")
def test_documents_engine_alone_names_a_broken_uri(field, value, cause, text, caplog):
    error = resolve_error({field: envelope(value)}, caplog, call="resolve_documents_engine")
    assert str(error) == (text or message(field, cause))


def test_the_engine_builder_raises_the_error_type_itself():
    with pytest.raises(cr.ConnectionConfigError) as raised:
        cr.WorkerConnectionResolver._create_engine(PROJECT, {"connection_uri": "postgres://ext:" + MARKER + "@db/x"})
    assert (raised.value.field, raised.value.cause) == ("database_config", "NoSuchModuleError")
    assert raised.value.__cause__ is None and raised.value.__suppress_context__


def test_the_first_field_that_fails_is_the_one_named(caplog):
    row = {"qdrant_config": envelope(without("qdrant_config", "port")), "database_config": corrupted({"x": 1})}
    assert resolve_error(row, caplog).field == "qdrant_config"


def test_documents_engine_alone_ignores_the_other_fields(caplog):
    row = {"database_config": envelope(GOOD["database_config"]), "qdrant_config": corrupted({"x": 1}),
           "s3_config": envelope({}), "embedding_config": envelope(None)}
    engine = resolver(row).resolve_documents_engine(PROJECT)
    assert engine.url.host == "db.example.edu"


# ── What is not a broken config ──

class _HostDown(Exception):
    pass


class _FailingSql:

    def getExternalConnection(self, project_name):
        raise _HostDown("host database unreachable")


@pytest.mark.parametrize("call", ["resolve", "resolve_documents_engine"])
def test_a_host_read_error_is_not_wrapped(call):
    """The worker retries a failed read of the host database; only a broken config is final."""
    with pytest.raises(_HostDown):
        getattr(cr.WorkerConnectionResolver(_FailingSql()), call)(PROJECT)


def test_the_error_survives_pickling():
    error = cr.ConnectionConfigError(PROJECT, "s3_config", "KeyError")
    copy = pickle.loads(pickle.dumps(error))
    assert (copy.project_name, copy.field, copy.cause, str(copy)) == (PROJECT, "s3_config", "KeyError",
                                                                     message("s3_config", "KeyError"))
    kept = cr.ConnectionConfigError(PROJECT, "database_config", "ValueError", "fixed text")
    assert str(pickle.loads(pickle.dumps(kept))) == "fixed text"
