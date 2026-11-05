# Development Setup

Set up a local development environment where the app processes run directly (with hot reload) while Docker provides the shared infrastructure.

For the all-Docker experience instead, see [Self-Hosting](../self-hosting/index.md).

## Prerequisites

- Git, Docker and Docker Compose
- [uv](https://docs.astral.sh/uv/) for the backend and ingest worker: `brew install uv`, or `curl -LsSf https://astral.sh/uv/install.sh | sh`. It installs the Python version pinned in `apps/backend/.python-version`, so no separate Python install is needed.
- Node.js 20.19+ or 22.12+ for the frontend. `apps/frontend/.nvmrc` pins v22.12.0 (`nvm use` picks it up); CI runs Node 20.
- An OpenAI-compatible embedding endpoint, for example [Ollama](https://ollama.com/) serving `Qwen/Qwen3-Embedding-8B`; ingest and retrieval need one, chat models do not have to be configured up front.

## Quick start

### 1. Clone the repository and configure the environment

```bash
git clone https://github.com/Center-for-AI-Innovation/Illinois-Chat.git
cd Illinois-Chat
cp .env.template .env
```

One value in `.env` must be set before anything starts:

- `SIM_APPROVAL_ADMIN_EMAIL` — your email. It names the account that becomes the Sim platform admin, and the start script refuses to run while it is empty. Leave it empty only if you will start with `--no-sim`.

Everything else in the root `.env` can stay as shipped for local work: the start script falls back to the dev defaults (`postgres`/`password`, `minioadmin`, `admin`) for anything unset, and generates `ENCRYPTION_MASTER_KEY` and the `SIM_*` secrets on the first run. The model and embedding values are set in step 4, in the app env files, not here. The full variable list is in the [Configuration reference](../self-hosting/configuration.md).

### 2. Install packages

=== "Backend and ingest worker"

    ```bash
    cd apps/backend
    uv sync --all-extras
    ```

    This creates `apps/backend/.venv` with the pinned Python and every dependency from `uv.lock`. Re-run it after pulling a changed `uv.lock`. Commands run through `uv run`, so nothing needs activating.

=== "Frontend"

    ```bash
    cd apps/frontend
    nvm use        # or any Node 20.19+ / 22.12+
    npm ci
    ```

=== "Crawler (optional)"

    The dev stack does not run Crawlee in Docker. Install it only if you will test web crawling:

    ```bash
    cd apps/crawlee
    npm install    # also installs the Playwright browsers
    ```

### 3. Start the infrastructure

On the first run (or whenever the database volume is empty), pass `--create-schema`:

```bash
bash infra/scripts/start-dev.sh --create-schema
```

Without the flag, an empty database stops the script with `Database is empty. Re-run with --create-schema`. The script exits before starting anything if `SIM_APPROVAL_ADMIN_EMAIL` is unset (unless `--no-sim` is given) or if `SIM_SSO_DOMAIN` is not a single domain.

This script:

- generates `ENCRYPTION_MASTER_KEY` and the `SIM_*` secrets into `.env` when they are missing;
- creates or updates the app-local env files (`apps/backend/.env`, `apps/frontend/.env`, `apps/crawlee/.env`) without overwriting existing values;
- starts the shared dev infrastructure from `infra/docker/docker-compose.dev.yaml`, plus the Sim stack from `infra/docker/docker-compose.sim.yaml` unless `--no-sim` is given;
- with `--create-schema`, applies the Postgres schema from `infra/db/init-schema.sql`; on every run it replays Drizzle migrations 0016 and 0017 (both are no-ops once applied);
- ensures the configured Qdrant collection exists with 4096-dimensional cosine vectors;
- creates the object-storage `uiuc-chat` bucket.

| Flag | Effect |
| --- | --- |
| `--create-schema` | Apply `infra/db/init-schema.sql` to an empty database. |
| `--clean` | Remove the dev containers and volumes first, then recreate the schema. Cannot be combined with `--create-schema`. |
| `--no-sim` | Start without the Sim AI tool stack. |
| `-h`, `--help` | Show usage. |

### 4. Set the model values in the app env files

In development the compose file only runs infrastructure; each app reads its own env file, which the script has just written:

- `apps/backend/.env` — Flask backend and ingest worker
- `apps/frontend/.env` — Next.js frontend (`npm run local`)
- `apps/crawlee/.env` — Crawlee, if you run it

They already hold the connection values for Postgres (app and Keycloak databases), Redis, RabbitMQ, Qdrant and object storage, the Keycloak realm and client, `ENCRYPTION_MASTER_KEY` and `ALLOWED_EMBEDDING_PROVIDERS`. The model keys are written **empty**, and the script does not copy the root `.env` values into them, so set these in **both** `apps/backend/.env` and `apps/frontend/.env`, with the same values:

| Key | Set it to |
| --- | --- |
| `EMBEDDING_MODEL` | `Qwen/Qwen3-Embedding-8B`, or another model that produces 4096-dimensional vectors (the `embeddings` column is `vector(4096)`). |
| `EMBEDDING_API_BASE` | The OpenAI-compatible endpoint serving it, e.g. `http://localhost:11434/v1` for Ollama on the host. |
| `NCSA_HOSTED_API_KEY` or `OPENAI_API_KEY` | Only if that endpoint needs a bearer token; either is sent. |

Left empty, both apps fall back to OpenAI's `text-embedding-ada-002` at `https://api.openai.com/v1`, whose 1536-dimensional vectors do not fit the column, so every ingest fails. Re-running the script later only appends keys that are missing, so your values survive.

Optional but worth setting now: `NEXT_PUBLIC_SIGNING_KEY` in `apps/frontend/.env` (provider keys that chatbot owners paste on the LLMs page are stored in plaintext without it) and `SUPER_ADMIN_EMAILS` (your email, to see every chatbot). Chat models themselves are configured per chatbot on its LLMs page; `OLLAMA_SERVER_URL` and `NCSA_HOSTED_API_KEY` only make the Ollama and NCSA providers available there. The `apps/backend/.env.template` and `apps/frontend/.env.template` files are dev reference files that no script reads.

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

### 5. Run the apps

Run each in its own terminal:

```bash
# Flask backend
cd apps/backend
uv run flask --app ai_ta_backend.main:app --debug run --port 8000
```

```bash
# ingest worker
cd apps/backend
uv run python ai_ta_backend/rabbitmq/worker.py
```

```bash
# Next.js frontend
cd apps/frontend
npm run local
```

```bash
# crawler, only if you installed it
cd apps/crawlee
npm start
```

Open `http://localhost:3000` and sign in. The local Keycloak realm (`illinois_chat_realm`, admin console at `http://localhost:8080`) ships with no users and allows self-registration, so register an account on the sign-in page, then create your first chatbot.

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

- Backend: run `uv sync --all-extras` in `apps/backend` again.
- Frontend: `npm ci` in `apps/frontend`.

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
