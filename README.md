# [In active development] Self Hostable UIUC.chat

## License

This project is available under [our Research Use Only license fully defined here](https://github.com/UIUC-Chatbot/self-hostable-ai-ta-backend/blob/main/ResearchUseONLYLicense-UIUC.CHAT.pdf). This license is similar in spirit to the [CC BY-NC 4.0 License](https://creativecommons.org/licenses/by-nc/4.0/) which restricts commercial use.

It's free to use for non-commercial use, like research. Any and all commercial use requires a commercial license, see below.

By contributing to this project, you accept the [CLA here](https://github.com/UIUC-Chatbot/self-hostable-ai-ta-backend/blob/main/CLA%20for%20Self%20Hostable%20UIUC.chat.pdf).

[![CC BY-NC 4.0 License Image](https://github.com/user-attachments/assets/21f4d62f-6a34-4e73-aae3-3129f81b8140)](https://creativecommons.org/licenses/by-nc/4.0/)

### Commercial Use

For commercial use of this project, you must obtain a separate commercial license. Please contact [otm@illinois.edu](mailto:otm@illinois.edu) and [ai@ncsa.illinois.edu](mailto:ai@ncsa.illinois.edu) to inquire about commercial licensing terms.

Failure to obtain a commercial license for commercial use is a violation of the terms of this project.

## Running

### Standard (full stack in Docker)

Use this when you want to run everything in Docker (frontend/backend/worker in containers).

Prereqs:
* Docker + Docker Compose v2
* Node.js + npm on the host (required by `init-db.sh`)

1) Checkout git submodules

```bash
git submodule update --init --recursive --remote
```

2) Create a `.env` and populate with required secrets

As of now you will need your own LLM(s) for chatting and for creation of embeddings.

```bash
cp .env.secrets .env
```

#### Environment files (Docker)

For the standalone Docker Compose stack, the root `.env` file is the source of truth:
* `docker compose` automatically reads `.env` in the same directory as `docker-compose.yaml` for variable substitution.
* `init-db.sh` also `source`s this same `.env` on the host.

`/.env.secrets` is a starter template containing only the secret values. After copying it to `.env`, you typically also need to add a few non-secret configuration variables used by `init-db.sh`:

```dotenv
# Host-reachable endpoints used by init-db.sh
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_DATABASE=postgres

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=uiuc-chat

S3_BUCKET_NAME=uiuc-chat
```

For development (hot reload on your host), separate env files are used (for example `uiuc-chat-backend/.env` and `uiuc-chat-frontend/.env.local`) as described in the Development section below.

3) Start the docker stack

```bash
docker compose up -d
```

4) Initiate all databases

```bash
sh init-db.sh
```

Notes:
* `init-db.sh` runs `npm install` / `npm run db:*` inside `uiuc-chat-frontend` on the host, so you need Node.js + npm available locally.
* It also expects `QDRANT_URL` (typically `http://localhost:6333`) to be reachable from the host during initialization.

5) Take down stack and comment out ports

This “bring it up → init → bring it down → comment ports → bring it up” flow is mainly to allow host-based initialization (`init-db.sh` needs to reach Postgres/Qdrant/MinIO via localhost), then reduce exposed services / avoid local port conflicts afterwards.

After initialization, for a more “standalone” deployment (and to avoid local port conflicts), bring the stack down and comment out host port mappings for:
* `postgres-illinois-chat` (`5432:5432`)
* `qdrant` (`6333:6333` and `6334:6334`)
* `minio` console/admin port (`9001:9001`) (keep `9000:9000`)

```bash
docker compose down
```

6) Restart stack

```bash
docker compose up -d
```

Works on version: `Docker Compose version v2.27.1-desktop.1`

Works on Apple Silicon M1 `aarch64`, and `x86`.

### Development (hot reload on host)

1) Start infrastructure services (Postgres/Redis/Qdrant/MinIO/RabbitMQ/Keycloak)

```bash
docker compose -f docker-compose.dev.yaml up -d
```

2) Run the backend with hot reload

Backend:
```bash
cd uiuc-chat-backend
infisical run --env=dev -- flask --app ai_ta_backend.main:app --debug run --port 8000
```

Frontend:
```bash
cd uiuc-chat-frontend
npm run dev
```

3) Stop infrastructure when done

```bash
docker compose -f docker-compose.dev.yaml down
```

### Models setup (Ollama)

If you want to run local models for embeddings (and optionally chat), you can bring up an Ollama container and preload a few embedding models.

Recommended: run the main stack and models together so containers can talk to `ollama` by hostname:

```bash
docker compose -f docker-compose.yaml -f docker-compose.models.yaml up -d
```

Then set in your root `.env`:

```dotenv
OLLAMA_SERVER_URL=http://ollama:11434
```

The `ollama-models-init` service will automatically pull models on first start. To re-run downloads:

```bash
docker compose -f docker-compose.models.yaml up ollama-models-init
```


### 🛠️ Technical Architecture

![Architecture diagram](https://github.com/UIUC-Chatbot/ai-ta-backend/assets/13607221/bda7b4d6-79ce-4d12-bf8f-cff9207c37af)

## Documentation

See docs on https://docs.uiuc.chat

## Fastest way to rebuild the images during dev

```bash
# rebuild only the frontend after file changes in that repo. Super quick, supports Docker's Layer Cache.
sudo bash init.sh --rebuild=uiuc-chat-frontend

# rebuild both frontend and backend after file changes
sudo bash init.sh --rebuild="uiuc-chat-frontend flask-app "
```

If you're interested in contributing, check out our [official developer quickstart](https://docs.uiuc.chat/developers/developer-quickstart).

## Advanced

### Configuring Postgres

It's strongly recommended to change your passwords away from the defaults.

### Configuring Database passwords

Customize your env variables. The SQL database can be any of SQLite, Postgres, and Supabase. The object storage can be Minio or AWS S3.

### Take schema dump from Postgres

```bash
PGPASSWORD=<password> pg_dump -h <hostname> -U <username> -d <database> --schema-only > schema.sql
```

### Restore dump in new Postgres

```bash
PGPASSWORD=<password> psql -h <new-hostname> -U <new-username> -d <new-database> -f schema.sql
```

## Docker

To force build all required images (frontend, backend, worker) run:

```bash
docker compose build --no-cache
```