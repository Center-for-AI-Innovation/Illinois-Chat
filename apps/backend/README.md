# Illinois Chat backend

The Flask backend (`ai_ta_backend/main.py`) and the RabbitMQ ingest worker (`ai_ta_backend/rabbitmq/`) of [Illinois Chat](https://github.com/Center-for-AI-Innovation/Illinois-Chat). The backend serves ingest, exports and Qdrant-backed retrieval for the web app; the worker turns queued ingest jobs into chunks and embeddings.

- Documentation: https://docs.chat.illinois.edu/
- Running it locally: https://docs.chat.illinois.edu/contributing/dev-setup/
- Endpoints the web app calls: https://docs.chat.illinois.edu/api/

## Run from this directory

With the dev infrastructure started by `infra/scripts/start-dev.sh`, and [uv](https://docs.astral.sh/uv/) installed:

```bash
uv sync --all-extras   # once, and after pulling a changed uv.lock

uv run flask --app ai_ta_backend.main:app --debug run --port 8000   # backend
uv run python ai_ta_backend/rabbitmq/worker.py                      # ingest worker, in another terminal
uv run pytest                                                       # tests
```

Dependencies are declared in `pyproject.toml` (shared, plus `api` and `worker` extras) and locked in `uv.lock`; `.python-version` pins the interpreter. To change one, edit `pyproject.toml`, run `uv lock`, and commit both files.

Both read `apps/backend/.env`, which `start-dev.sh` writes. The containers for the full stack are built from `Self-Hosted-Dockerfile` (backend) and `ai_ta_backend/rabbitmq/Dockerfile` (worker).
