# [In active development] Self Hostable UIUC.chat

## License

This project is available under [our Research Use Only license fully defined here](https://github.com/UIUC-Chatbot/self-hostable-ai-ta-backend/blob/main/ResearchUseONLYLicense-UIUC.CHAT.pdf). This license is similar in spirit to the [CC BY-NC 4.0 License](https://creativecommons.org/licenses/by-nc/4.0/) which restricts commercial use.

It's free to use for non-commercial use, like research. Any and all commercial use requires a commercial license, see below.

By contributing to this project, you accept the [CLA here](https://github.com/UIUC-Chatbot/self-hostable-ai-ta-backend/blob/main/CLA%20for%20Self%20Hostable%20UIUC.chat.pdf).

[![CC BY-NC 4.0 License Image](https://github.com/user-attachments/assets/21f4d62f-6a34-4e73-aae3-3129f81b8140)](https://creativecommons.org/licenses/by-nc/4.0/)

### Commercial Use

For commercial use of this project, you must obtain a separate commercial license. Please contact [otm@illinois.edu](mailto:otm@illinois.edu) and [ai@ncsa.illinois.edu](mailto:ai@ncsa.illinois.edu) to inquire about commercial licensing terms.

Failure to obtain a commercial license for commercial use is a violation of the terms of this project.

## Quickstart (Self host with Docker)

### 🎉 Get started with a single command

```bash
bash infra/scripts/start-all.sh
```
This will:
* Create a repository-root `.env` file from `.env.template` if needed.
* Start the full Docker stack: frontend, Flask backend, ingest worker, Redis, MinIO, Qdrant, Postgres, RabbitMQ, Crawlee, and Keycloak.
* Initialize Postgres from `infra/db/migrations/20250328_remote_schema.sql`.
* Ensure the configured Qdrant collection exists with 4096-dimensional cosine vectors.


To start fresh, you can use: 
```bash
# erase and factory reset all databases
bash infra/scripts/start-all.sh --wipe_data
```

### Configuring Postgres (Supabase)

It's strongly recommended to change your passwords away from the defaults. The Supabase `.env` file is separate from the rest of the code for compatibility with Supabase's self-hosted offering and community documentation.
The .env file is stored in the local path: `./supabase/docker/.env`

### Configuring Database passwords

Customize your env variables. The SQL database can be SQLite, Postgres, or Supabase. The object storage can be MinIO or AWS S3.

### Take schema dump from Postgres (Supabase)
```bash
PGPASSWORD=<password> pg_dump -h aws-0-us-east-1.pooler.supabase.com -U postgres.twzwfuydgnnjcaopyfdv -d postgres --schema-only > schema.sql
```

### Restore dump in new Postgres
```bash
PGPASSWORD=<password> psql -h <new-hostname> -U <new-db> -d postgres -f schema.sql
```

Works on version: `Docker Compose version v2.27.1-desktop.1`

Works on Apple Silicon M1 `aarch64`, and `x86`.

Because the compose files live under `infra/docker`, commands use `--project-directory .` so Docker Compose resolves `.env`, `./apps/*`, and `./infra/*` from the repository root.

### Environment files

For the full Docker stack and e2e testing, the repository-root `.env` is the source file Docker Compose reads. `infra/docker/docker-compose.yaml` maps those values into the frontend, backend, ingest worker, Crawlee, Keycloak, Postgres, MinIO, RabbitMQ, Redis, and Qdrant containers.

Inside Docker, service-to-service URLs use Compose service names, for example `http://backend:8001`, `http://qdrant:6333`, `http://minio:9000`, and `postgres-illinois-chat`. Browser-facing URLs still use localhost, for example `http://localhost:3000`, `http://localhost:8080`, and `http://localhost:9000`.

The app-local env files are for running services outside the full Docker stack:

- `apps/backend/.env` is used by the Flask backend and ingest worker when you run them directly.
- `apps/frontend/.env` is used by `npm run local` in `apps/frontend`.
- `apps/crawlee/.env` is used only when running Crawlee directly from `apps/crawlee`; the full Docker stack uses the root `.env` plus explicit values in `infra/docker/docker-compose.yaml`.

MinIO ports differ by mode:

- Full Docker/e2e stack: browser API endpoint `http://localhost:9000`, console `http://localhost:9001`.
- Local dev infrastructure: browser and local app API endpoint `http://localhost:10000`, console `http://localhost:9001`.


### 🛠️ Technical Architecture

![Architecture diagram](https://github.com/UIUC-Chatbot/ai-ta-backend/assets/13607221/bda7b4d6-79ce-4d12-bf8f-cff9207c37af)

## Documentation

See docs on https://docs.uiuc.chat

## 📣 Development

## Run the frontend and backend with hot reload:

Backend:
```bash
cd apps/backend
infisical run --env=dev -- flask --app ai_ta_backend.main:app --debug run --port 8000
```
Ingest worker:
```bash
cd apps/backend
python ai_ta_backend/rabbitmq/worker.py
```
Frontend:
```bash
cd apps/frontend
npm run local
```

## Fastest way to rebuild the images during dev

```bash
# rebuild only the frontend after file changes
bash infra/scripts/start-all.sh --rebuild=frontend

# rebuild both frontend and backend after file changes
bash infra/scripts/start-all.sh --rebuild=frontend,backend
```

## Stop the full Docker stack

```bash
bash infra/scripts/stop-all.sh

# stop and remove full-stack volumes
bash infra/scripts/stop-all.sh --volumes
```

If you're interested in contributing, check out our [official developer quickstart](https://docs.uiuc.chat/developers/developer-quickstart).
