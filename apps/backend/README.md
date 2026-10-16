# Illinois Chat backend

The Flask backend (`ai_ta_backend/main.py`) and the RabbitMQ ingest worker (`ai_ta_backend/rabbitmq/`) of [Illinois Chat](https://github.com/Center-for-AI-Innovation/Illinois-Chat). The backend serves ingest, exports and Qdrant-backed retrieval for the web app; the worker turns queued ingest jobs into chunks and embeddings.

- Documentation: https://docs.chat.illinois.edu/
- Running it locally: https://docs.chat.illinois.edu/contributing/dev-setup/
- Endpoints the web app calls: https://docs.chat.illinois.edu/api/

## Run from this directory

With the dev infrastructure started by `infra/scripts/start-dev.sh`, and Python 3.10 or 3.11:

```bash
python3.11 -m venv venv && source venv/bin/activate   # once
pip install -r requirements.txt -r ai_ta_backend/rabbitmq/requirements.txt

flask --app ai_ta_backend.main:app --debug run --port 8000   # backend
python ai_ta_backend/rabbitmq/worker.py                      # ingest worker, in another terminal
```

Dependencies for the backend are in `requirements.txt`; the worker's are in `ai_ta_backend/rabbitmq/requirements.txt`.

Both read `apps/backend/.env`, which `start-dev.sh` writes. The containers for the full stack are built from `Self-Hosted-Dockerfile` (backend) and `ai_ta_backend/rabbitmq/Dockerfile` (worker).
