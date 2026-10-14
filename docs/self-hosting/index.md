# Self-Hosting

Illinois Chat is fully open source (Apache 2.0) and ships with a Docker Compose stack that runs the entire platform — the application services, the Sim AI tools platform and all required infrastructure — on your own hardware.

## Requirements

- Docker v24+ and Docker Compose v2
- Git
- Python 3.10/3.11 and Node.js 20.19+/22.12+ only if you plan to [develop locally](../contributing/dev-setup.md)

## First run

```bash
# 1. Clone the monorepo
git clone https://github.com/Center-for-AI-Innovation/Illinois-Chat.git
cd Illinois-Chat

# 2. Create .env and set the two values the stack cannot guess
cp .env.template .env
#    SIM_APPROVAL_ADMIN_EMAIL=you@example.edu   (becomes the Sim platform admin)
#    SIM_API_BASE_URL=http://simstudio:3000     (the template value is for local development)

# 3. Start everything and create the database schema
bash infra/scripts/start-all.sh --create-schema
```

`start-all.sh` exits before building anything if `SIM_APPROVAL_ADMIN_EMAIL` is empty; pass `--no-sim` to run without the tools platform instead. On the first run it also generates `ENCRYPTION_MASTER_KEY` and the `SIM_*` secrets into `.env`, pulls the Sim images, builds the application images, waits for every service to report healthy, applies `infra/db/init-schema.sql`, replays Drizzle migrations 0016 and 0017, and creates the Qdrant collection. A plain `start-all.sh` on an empty database stops with "Database is empty. Re-run with --create-schema".

Open **http://localhost:3000** and create your first chatbot. Sim is at **http://localhost:3010**; sign in with the address you set as `SIM_APPROVAL_ADMIN_EMAIL`.

!!! tip "No OpenAI key required"
    Configure `EMBEDDING_MODEL` and `EMBEDDING_API_BASE` for any OpenAI-compatible embedding endpoint (the default expects Qwen3-Embedding-8B, 4096-dimensional vectors), and let each chatbot pick its chat models on its LLMs page — Ollama, vLLM, the NCSA-hosted models or a commercial provider. See the [Configuration reference](configuration.md).

## Script flags

| Script | Flag | Effect |
| --- | --- | --- |
| `start-all.sh` | `--create-schema` | Apply `infra/db/init-schema.sql` to an empty database. Required on the first run; later runs never need it. |
| | `--wipe_data` | `docker compose down -v`, then start and recreate the schema. Cannot be combined with `--create-schema`. |
| | `--rebuild=svc1,svc2` | Rebuild only the named images (for example `frontend,backend`), then start everything. |
| | `--no-sim` | Start without the Sim AI stack. Sim containers from a previous run are left untouched. |
| | `-h`, `--help` | Usage. |
| `stop-all.sh` | *(none)* | Stop every container; volumes are kept, so the database survives stop/start cycles. |
| | `--volumes`, `-v` | Also remove the volumes and local data (see [Backup & restore](backup-restore.md)). |
| | `--no-sim` | Stop only the application stack and leave the Sim containers running. |

```bash
bash infra/scripts/start-all.sh                       # later runs
bash infra/scripts/start-all.sh --rebuild=frontend    # rebuild one image
bash infra/scripts/stop-all.sh                        # stop, keep data
```

## What's running

| Service (Compose name) | Role |
| --- | --- |
| `frontend` | Next.js web application; most API routes live here |
| `backend` | Flask API: retrieval, ingest queueing, exports; reachable only inside the Compose network |
| `worker` | Ingest worker consuming the RabbitMQ queue |
| `crawlee` | Web-crawling service |
| `postgres-illinois-chat` | Application database (`pgvector/pgvector:pg17`); the default vector store |
| `postgres-keycloak` | Keycloak's database (`postgres:18`) |
| `keycloak` | Authentication |
| `minio` + `minio-init` | Object storage (Silo, a MinIO-compatible server) and the one-shot bucket creator |
| `redis` | Chatbot metadata and the per-chatbot LLM settings |
| `rabbitmq` | Ingest queue |
| `qdrant` | Optional vector store, used only by chatbots with an external Qdrant connection |
| `simstudio`, `sim-realtime`, `sim-db` | The Sim AI tools platform and its database |
| `sim-migrations`, `sim-approval-setup`, `sim-keycloak-setup`, `sim-sso-setup` | One-shot Sim setup jobs that run on every start |

Host ports and the internal-only list are on [Services, ports & architecture](architecture.md).

## Optional: local model serving

`infra/docker/docker-compose.models.yaml` adds an Ollama container on port 11434 so inference can run on the same host. The overlay also declares an `ollama-models-init` job that mounts `./scripts/init-ollama-models.sh`, a file the repository does not contain — see [Troubleshooting](troubleshooting.md).

## Production checklist

- [ ] Change every default password in `.env`: `POSTGRES_PASSWORD`, `INGEST_REDIS_PASSWORD`, `QDRANT_API_KEY`, the object-storage credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) and `KEYCLOAK_ADMIN_PASSWORD`.
- [ ] Keep the generated `ENCRYPTION_MASTER_KEY` and `SIM_*` secrets with your other secrets; losing `ENCRYPTION_MASTER_KEY` means every chatbot re-enters its Sim key, and losing `SIM_ENCRYPTION_KEY` or `SIM_API_ENCRYPTION_KEY` means re-entering every secret stored inside Sim.
- [ ] Set `SIM_SSO_DOMAIN` to the one email domain allowed to sign in to Sim.
- [ ] Terminate TLS in front of the stack (a reverse proxy such as nginx, Caddy or Traefik).
- [ ] Restrict exposed ports to what users need (typically the frontend and Sim).
- [ ] Back up the Docker volumes on a schedule — see [Backup & restore](backup-restore.md).
- [ ] Ensure `QDRANT_API_KEY` in `.env` matches `api_key` in `qdrant_config.yaml`.

For AWS ECS Fargate see [Cloud deployment (ECS)](cloud-deployment.md); before moving between releases read [Upgrading](upgrading.md).
