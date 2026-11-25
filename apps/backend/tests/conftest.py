"""
Keep the suite independent of the machine it runs on.

CI has no ``apps/backend/.env`` and a bare environment; a developer's checkout has both.
The backend reads its configuration at import time, so without this file the same test
can pass in CI and fail locally (or the other way round). pytest imports conftest.py
before any test module, which is before any ``ai_ta_backend`` module is imported.
"""

from __future__ import annotations

import os

import dotenv
import nltk

# main.py, ingest.py, ingest_canvas.py and rmsql.py call load_dotenv() when imported, which
# pulls the developer's .env into os.environ for the whole run. Tests that need a variable
# set it themselves with monkeypatch.
dotenv.load_dotenv = lambda *args, **kwargs: False

# Parsed once into a module constant when retrieval_service is imported; a value exported
# in the shell (the compose default is "openai,ollama") changes which providers the
# resolver tests see as allowed.
os.environ.pop("ALLOWED_EMBEDDING_PROVIDERS", None)

# main.py builds its SQLAlchemy engine when it is imported and raises without a database
# configuration, so every test that imports it used to need a developer's .env. The engine
# connects lazily and no test queries through it; a host that cannot resolve also means a
# test can never reach a real database by accident. tests/test_pgvector_store.py takes its
# database from TEST_POSTGRES_URI instead.
os.environ.pop("SQLITE_DB_NAME", None)
os.environ.update(
    POSTGRES_USERNAME="test",
    POSTGRES_PASSWORD="test",
    POSTGRES_ENDPOINT="db.invalid",
    POSTGRES_PORT="5432",
    POSTGRES_DATABASE="test",
)

# ingest.py downloads two NLTK packages on import when they are missing. No test needs
# them, and collection should not depend on the network.
nltk.download = lambda *args, **kwargs: False
