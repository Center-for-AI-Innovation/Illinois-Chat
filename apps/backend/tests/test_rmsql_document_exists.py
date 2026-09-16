"""`document_exists_for_url` is the worker's pre-download dedup for crawled PDFs.

It replaces a LIKE '%url%' query that also matched `…/a.pdf?v=2` for `…/a.pdf`,
so the exactness is the point of these tests. Runs against in-memory SQLite via
the engine-injection constructor the worker's resolver already uses.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine

from ai_ta_backend.rabbitmq import models
from ai_ta_backend.rabbitmq.rmsql import SQLAlchemyIngestDB

COURSE = "CS 101"
URL = "https://x.edu/docs/handbook.pdf"


@pytest.fixture()
def db():
    engine = create_engine("sqlite://")
    models.Document.__table__.create(engine)
    yield SQLAlchemyIngestDB(engine=engine)
    engine.dispose()


def insert_doc(db, doc_id, course_name, url):
    with db.get_session() as session:
        session.add(models.Document(id=doc_id, course_name=course_name, url=url, s3_path=f"courses/{course_name}/f.pdf"))
        session.commit()


def test_false_when_nothing_ingested(db):
    assert db.document_exists_for_url(COURSE, URL) is False


def test_true_for_an_exact_match(db):
    insert_doc(db, 1, COURSE, URL)
    assert db.document_exists_for_url(COURSE, URL) is True


@pytest.mark.parametrize(
    "stored",
    [
        "https://x.edu/docs/handbook.pdf?v=2",  # the LIKE query's false positive
        "https://x.edu/docs/handbook.pdf/extra",
        "https://x.edu/docs/other-handbook.pdf",
        "http://x.edu/docs/handbook.pdf",  # different scheme
    ],
)
def test_false_for_near_misses(db, stored):
    insert_doc(db, 1, COURSE, stored)
    assert db.document_exists_for_url(COURSE, URL) is False


def test_scoped_to_the_course(db):
    insert_doc(db, 1, "OTHER 200", URL)
    assert db.document_exists_for_url(COURSE, URL) is False
