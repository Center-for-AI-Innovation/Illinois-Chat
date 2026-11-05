# Repository layout

Illinois Chat is one repository: [Center-for-AI-Innovation/Illinois-Chat](https://github.com/Center-for-AI-Innovation/Illinois-Chat). All development happens here, on branches off `main`; pull requests target `main`. The frontend, backend and crawler were merged into it from separate repositories in May 2026 with their history preserved, and those earlier repositories are no longer updated.

## Top level

| Path | Contents |
| --- | --- |
| `apps/frontend` | The Next.js web application: pages, API routes, the Drizzle schema and migrations. Most product logic lives here. |
| `apps/backend` | The Flask backend (`ai_ta_backend/main.py`) and the RabbitMQ ingest worker (`ai_ta_backend/rabbitmq`). |
| `apps/crawlee` | The Crawlee web-crawling service. |
| `infra/docker` | Docker Compose files: `docker-compose.yaml` (full stack), `docker-compose.dev.yaml` (infrastructure for local development), `docker-compose.sim.yaml` (Sim AI), `docker-compose.models.yaml` (Ollama); `sim/` holds the Sim setup SQL. |
| `infra/db` | `init-schema.sql`, the Postgres schema applied on an empty database, and the external-store migrations. |
| `infra/keycloak` | The Keycloak realm exports (`realms/`) and login theme (`theme/`). |
| `infra/scripts` | `start-all.sh` / `stop-all.sh` for the full stack, `start-dev.sh` / `stop-dev.sh` for development, and the external-connection provisioning script. |
| `docs/`, `mkdocs.yml`, `overrides/` | This documentation site. See [Writing docs](writing-docs.md). |
| `.github/workflows` | CI: `pr-checks.yml`, `illinois-chat-dev.yml`, `release-images.yml`, `docs.yml`. See [Testing & CI](testing-ci.md). |
| `.trunk` | Linter configuration shared by CI and the local `trunk` CLI. |
| `.env.template` | The root environment template the start scripts copy to `.env`. See the [Configuration reference](../self-hosting/configuration.md). |

## Inside the apps

- **Frontend** (`apps/frontend/src`): `pages/` holds the routes and the `pages/api` handlers, `components/` the UI, `db/` the Drizzle schema (`schema.ts`) and `migrations/`, `utils/` and `server/` the server-side logic such as retrieval and authorization, `__tests__/` the Vitest suites.
- **Backend** (`apps/backend/ai_ta_backend`): `main.py` registers the routes, `service/` and `database/` implement them, `rabbitmq/` is the ingest worker with its own `Dockerfile` (dependencies for both live in `apps/backend/pyproject.toml` and `uv.lock`), `utils/` holds exports and email.
- **Crawler** (`apps/crawlee/src`): the crawl API and the per-page ingest calls to the backend.

Each app has its own `README.md`, `Dockerfile` and lockfile; the root `README.md` is the entry point for the whole repository.
