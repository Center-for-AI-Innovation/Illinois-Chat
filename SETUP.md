# Self-Hostable UIUC.chat Setup Guide

## Prerequisites

- Docker + Docker Compose v2
- Node.js + npm (for database initialization)
- MinIO client (`mc`) - install via `brew install minio/stable/mc` on macOS

## Quick Start

### 1. Clone and Initialize Submodules

```bash
git submodule update --init --recursive --remote
```

### 2. Configure Environment

```bash
cp .env.secrets .env
```

Edit `.env` and add the following host-reachable values for initialization:

```dotenv
POSTGRES_ENDPOINT=localhost
POSTGRES_PORT=5432
POSTGRES_USERNAME=postgres
POSTGRES_DATABASE=postgres

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=uiuc-chat

S3_BUCKET_NAME=uiuc-chat
```

> **Important:** Update `QDRANT_URL` to `http://localhost:6333` (not `http://qdrant:6333`) for init script to work from host.

### 3. Start Services

```bash
docker compose up -d
```

### 4. Initialize Databases

```bash
sh init-db.sh
```

This script:

- Pushes schema to PostgreSQL
- Creates Qdrant collection
- Creates MinIO bucket

### 5. Restart Stack

```bash
docker compose down
docker compose up -d
```

## Services Overview

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 3000 | Next.js web application |
| `backend` | - | Flask API server |
| `worker` | - | RabbitMQ consumer for async tasks |
| `keycloak` | 8080 | Authentication (OpenID Connect) |
| `postgres-illinois-chat` | - | Main application database |
| `postgres-keycloak` | - | Keycloak database |
| `qdrant` | - | Vector database for embeddings |
| `redis` | - | Caching layer |
| `rabbitmq` | - | Message queue |
| `minio` | 9000 | S3-compatible object storage |

## Access Points

- **Frontend:** http://localhost:3000
- **Keycloak Admin:** http://keycloak.localhost:8080 (admin / `KEYCLOAK_ADMIN_PASSWORD`)
- **MinIO API:** http://localhost:9000

## Local LLM Setup (WIP)

> **Note:** Full instructions for running a completely offline/air-gapped deployment with local LLMs are not yet available.

For local embeddings via Ollama, you can use the models compose file:

```bash
docker compose -f docker-compose.yaml -f docker-compose.models.yaml up -d
```

Then set in `.env`:

```dotenv
OLLAMA_SERVER_URL=http://ollama:11434
```

The `ollama-models-init` service will pull models on first start. However, configuring the frontend/backend to use local models exclusively (without any external API calls) requires additional setup not yet documented.

## Troubleshooting

- **Qdrant init fails:** Ensure `QDRANT_URL=http://localhost:6333` in `.env` (not the Docker internal hostname)
- **MinIO bucket creation fails:** Install `mc` client or let the worker container create it via fallback
- **Keycloak unreachable:** Add `127.0.0.1 keycloak.localhost` to `/etc/hosts` if needed

## Tested On

- Docker Compose v2.27.1
- Apple Silicon (M1/M2) and x86
