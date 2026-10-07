# Development Setup

Set up a local development environment where the app processes run directly (with hot reload) while Docker provides the shared infrastructure.

For the all-Docker experience instead, see [Self-Hosting](../self-hosting/index.md).

## Prerequisites

- Docker and Docker Compose
- Python 3.10 or 3.11 (backend and ingest worker)
- Node.js 20.19+ or 22.12+ (frontend). `apps/frontend/.nvmrc` pins v22.12.0; CI runs Node 20.
- For the Sim AI tool stack (started by default): set `SIM_APPROVAL_ADMIN_EMAIL` in the repository-root `.env`, or pass `--no-sim`.

## Quick start

### 1. Start infrastructure services

On the first run (or whenever the database volume is empty), pass `--create-schema`:

```bash
bash infra/scripts/start-dev.sh --create-schema
```

Without the flag, an empty database stops the script with `Database is empty. Re-run with --create-schema`. The script exits before starting anything if `SIM_APPROVAL_ADMIN_EMAIL` is unset (unless `--no-sim` is given) or if `SIM_SSO_DOMAIN` is not a single domain.

This script:

- creates a repository-root `.env` from `.env.template` if needed, and generates `ENCRYPTION_MASTER_KEY` and the `SIM_*` secrets when they are missing;
- creates or updates app-local env files (`apps/backend/.env`, `apps/frontend/.env`, `apps/crawlee/.env`) without overwriting existing values;
- starts shared dev infrastructure from `infra/docker/docker-compose.dev.yaml`, plus the Sim stack from `infra/docker/docker-compose.sim.yaml` unless `--no-sim` is given;
- with `--create-schema`, applies the Postgres schema from `infra/db/init-schema.sql`; on every run it replays Drizzle migrations 0016 and 0017 (both are no-ops once applied);
- ensures the configured Qdrant collection exists with 4096-dimensional cosine vectors;
- creates the object-storage `uiuc-chat` bucket.

| Flag | Effect |
| --- | --- |
| `--create-schema` | Apply `infra/db/init-schema.sql` to an empty database. |
| `--clean` | Remove the dev containers and volumes first, then recreate the schema. Cannot be combined with `--create-schema`. |
| `--no-sim` | Start without the Sim AI tool stack. |
| `-h`, `--help` | Show usage. |

### 2. Configure environment variables

In development mode the compose file only runs infrastructure; each app reads its own env file:

- `apps/backend/.env` — Flask backend and ingest worker
- `apps/frontend/.env` — Next.js frontend (`npm run local`)
- `apps/crawlee/.env` — Crawlee, if run outside Docker

`start-dev.sh` writes these files itself: connection values for Postgres (app and Keycloak databases), Redis, RabbitMQ, Qdrant and object storage, the Keycloak realm and client, `ENCRYPTION_MASTER_KEY`, `ALLOWED_EMBEDDING_PROVIDERS`, and empty placeholders for model endpoints and API keys (`EMBEDDING_MODEL`, `EMBEDDING_API_BASE`, `NCSA_HOSTED_*`, `OLLAMA_SERVER_URL`, `OPENAI_API_KEY`, `NEXT_PUBLIC_SIGNING_KEY`, …). The `apps/backend/.env.template` and `apps/frontend/.env.template` files are dev reference files that no script reads. The full variable list is in the [Configuration reference](../self-hosting/configuration.md).

OpenAI is **not** required. Configure `EMBEDDING_MODEL` and `EMBEDDING_API_BASE` for an OpenAI-compatible embedding endpoint; the default collection expects Qwen3-Embedding-8B vectors (dimension 4096).

For uploads and ingest, always use the object-storage **API** port, not the console port (the dev stack runs [Silo](https://github.com/pgsty/silo), a MinIO-compatible server, as the compose service `minio`):

```env
# apps/frontend/.env
MINIO_ENDPOINT=http://localhost:10000
MINIO_PUBLIC_ENDPOINT=http://localhost:10000
NEXT_PUBLIC_S3_ENDPOINT=http://localhost:10000

# apps/backend/.env
MINIO_URL=http://localhost:10000
MINIO_ENDPOINT=http://localhost:10000
MINIO_PUBLIC_ENDPOINT=http://localhost:10000
```

`http://localhost:9001` is the object-storage console and must not be used for S3 uploads.

### 3. Start the app processes

Run each in its own terminal:

```bash
# Flask backend
cd apps/backend
flask --app ai_ta_backend.main:app --debug run --port 8000
```

```bash
# ingest worker
cd apps/backend
python ai_ta_backend/rabbitmq/worker.py
```

```bash
# Next.js frontend
cd apps/frontend
npm run local
```

## Manual setup (alternative)

=== "Backend"

    ```bash
    cd apps/backend

    python3.11 -m venv venv
    source venv/bin/activate

    pip install -r requirements.txt
    pip install -r ai_ta_backend/rabbitmq/requirements.txt

    flask --app ai_ta_backend.main:app --debug run --port 8000
    # in another terminal:
    python ai_ta_backend/rabbitmq/worker.py
    ```

=== "Frontend"

    ```bash
    cd apps/frontend

    npm install
    npm run local
    ```

## Services overview

Apps run on the host; everything else is a container from `docker-compose.dev.yaml` (and `docker-compose.sim.yaml`).

| Service | Host port(s) | Description |
| --- | --- | --- |
| Frontend | 3000 | Next.js application (`npm run local`) |
| Backend API | 8000 | Flask API (`flask run`) |
| Keycloak | 8080 | Authentication service |
| Postgres (app) | 5432 | `pgvector/pgvector:pg17`, service `postgres-illinois-chat` |
| Postgres (Keycloak) | 5433 | `postgres:18`, service `postgres-keycloak` |
| Redis | 6379 | Project and user metadata |
| Qdrant | 6333, 6334 | Optional per-chatbot vector store |
| Object storage (Silo) | 10000 (API), 9001 (console) | Service `minio` |
| RabbitMQ | 5672, 15672 (management UI) | Ingest queue |
| drizzle-gateway | 4983 | Drizzle Studio for the app database |
| Sim AI | 3010 (app), 3011 (realtime), 55432 (Sim DB) | Tool platform; skipped with `--no-sim` |

## Database configuration

PostgreSQL is recommended:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=postgres
```

SQLite is available as a lightweight alternative for the Flask backend and ingest worker only; the frontend needs Postgres:

```env
SQLITE_DB_NAME=uiuc_chat_local.db
```

## Schema changes (Drizzle)

The app schema is owned by the frontend's Drizzle definition, `apps/frontend/src/db/schema.ts`, with migrations in `apps/frontend/src/db/migrations`. From `apps/frontend`:

```bash
npm run db:generate   # write a new migration from schema.ts
npm run db:migrate    # apply pending migrations to the database in .env
npm run db:studio     # browse the database
```

`infra/db/init-schema.sql` is derived from the Drizzle schema and is what `--create-schema` applies to an empty database; keep it in step with new migrations. The start scripts replay only migrations 0016 and 0017 on boot.

## Linting and PRs

Linting is enforced with [Trunk](https://trunk.io) (`npm exec trunk check` in the frontend, or the `trunk` CLI). What pull requests run, and how to run the same checks locally, is on [Testing & CI](testing-ci.md).

## Troubleshooting

**Database connection issues**

- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check accessibility:
  `docker compose --project-directory . -f infra/docker/docker-compose.dev.yaml exec postgres-illinois-chat pg_isready -U postgres`

**Port conflicts**

- Modify port mappings in `infra/docker/docker-compose.dev.yaml` and update the corresponding `.env` values.

**Missing dependencies**

- Backend: activate the virtualenv and `pip install -r requirements.txt`.
- Frontend: `npm install` in `apps/frontend`.

**Environment variables**

- Re-run `bash infra/scripts/start-dev.sh` to create or append missing local env keys.
- Fill hosted model/API values in the app-local `.env` files when you need non-local services.

Stack-level symptoms (`Database is empty`, the `SIM_APPROVAL_ADMIN_EMAIL` exit, an old Postgres volume) are on [Troubleshooting](../self-hosting/troubleshooting.md).

## Stopping everything

```bash
# stop app processes: Ctrl+C in each terminal

# stop infrastructure
bash infra/scripts/stop-dev.sh

# stop infrastructure and remove local volumes/data
bash infra/scripts/stop-dev.sh --volumes

# stop infrastructure but leave Sim running
bash infra/scripts/stop-dev.sh --no-sim
```
