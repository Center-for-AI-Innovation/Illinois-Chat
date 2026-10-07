# Backup & restore

All persistent state of the full stack lives in named Docker volumes. Back up every volume below; the images and `.env` are the only other things a restore needs.

## What to back up

| Volume | Contents |
| --- | --- |
| `postgres-illinois-chat` | Chatbots, documents, conversations, embeddings (pgvector), external-connection configs |
| `postgres-keycloak` | Users and realm state |
| `minio-data` | Uploaded files (object storage) |
| `rabbitmq` | Queued ingest jobs; losing it only drops jobs that had not been processed |
| `redis-data` | Chatbot metadata and LLM settings |
| `qdrant-data` | Embeddings of chatbots that use an external Qdrant connection |
| `sim-postgres-data` | Sim workflows, workspaces, API keys and the approval table |

Volume names are prefixed with the Compose project name, by default the repository folder name (`illinois-chat_postgres-illinois-chat`). `docker volume ls` shows the exact names.

Keep `.env` with the backup: `ENCRYPTION_MASTER_KEY` decrypts the stored Sim keys and external-connection configs, and the `SIM_*` secrets decrypt what is stored inside Sim. A restored database without the matching keys cannot read them.

## Copying a volume

Stop the stack first so the files are consistent, then copy each volume with a throwaway container:

```bash
bash infra/scripts/stop-all.sh

# back up
docker run --rm -v <project>_postgres-illinois-chat:/from -v "$PWD/backup":/to \
  alpine sh -c 'cp -a /from/. /to/postgres-illinois-chat/'

# restore into an empty volume
docker volume create <project>_postgres-illinois-chat
docker run --rm -v "$PWD/backup/postgres-illinois-chat":/from -v <project>_postgres-illinois-chat:/to \
  alpine sh -c 'cp -a /from/. /to/'

bash infra/scripts/start-all.sh
```

Repeat for the other volumes. For the two Postgres volumes a `pg_dump` taken while the stack runs is an alternative that does not need downtime.

## What destroys data

- `start-all.sh --wipe_data` runs `docker compose down -v` and recreates the schema on fresh volumes: every volume in the table above is deleted, including Sim's, unless the script was started with `--no-sim`.
- `stop-all.sh --volumes` (or `-v`) removes the same volumes without restarting.
- `start-dev.sh --clean` and `stop-dev.sh --volumes` do the same for the dev stack's volumes.
- Changing `ENCRYPTION_MASTER_KEY` or a `SIM_*` encryption key does not delete anything but makes the values encrypted under the old key unreadable.
