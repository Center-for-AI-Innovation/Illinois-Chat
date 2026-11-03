# Troubleshooting

Symptoms seen on self-hosted stacks, with the page that owns the fix. Sim-specific problems are in "Troubleshooting" on [Tools Platform (Sim AI)](sim.md); problems with external stores are in "Verifying and troubleshooting" on [External connections (operators)](external-connections.md).

## Reading the logs

The backend and the ingest worker write one line per event to their container output. To watch both while you repeat the problem, run this from the repository root:

```bash
docker compose --project-directory . -f infra/docker/docker-compose.yaml logs -f backend worker
```

The frontend and the web crawler write their lines to their container output too. To watch them, for example while you repeat an upload or a website import:

```bash
docker compose --project-directory . -f infra/docker/docker-compose.yaml logs -f frontend crawlee
```

Every line has the same shape: the time in UTC, the level, the part of the code that wrote it, the ids that are known, then the message.

```text
2026-11-02T14:03:01.050Z INFO    api.ingest rid=5f3a9c1e0b2d path=/api/UIUC-api/ingest course=ece120 submitted to ingest queue file=courses/ece120/5f3a9c1e-0b2d-4c1a-9e2f-3b7d6a8c1f04-lecture1.pdf status=200 task_id=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17
2026-11-02T14:03:09.410Z INFO    ingest rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 done handler=_ingest_single_pdf file=courses/ece120/lecture1.pdf result=Success ms=5321
```

- `rid=` is the request id. An upload keeps the same id from the API call, through the queue, to the worker.
- `job=` is the ingest job and `course=` the chatbot's project name. A field that is not known is left out.
- `path=` is on frontend lines only: the API route that was called.
- A failure is logged at `ERROR`. The line says what failed and why; when there is a traceback, it follows on the next lines.

The web crawler's lines look a little different. The time has a space instead of `T` and no `Z`, the level names are short (`WARN` instead of `WARNING`), and the ids come first, followed by `:`:

```text
2026-11-03 00:16:29.261 INFO  rid=3c9e51b07a24 course=ece120: crawl started url=https://ece.illinois.edu/ strategy=same-hostname maxPages=50
```

**Follow one request.** The backend sends the request id back in the `X-Request-ID` header of every reply. A caller may also send its own id in an `X-Request-ID` request header (letters, digits, `-` and `_`, up to 64 characters), and the backend then uses it. To see everything that happened for one id, in every container:

```bash
docker compose --project-directory . -f infra/docker/docker-compose.yaml logs backend worker | grep rid=5f3a9c1e0b2d
```

If you do not have the id, find the failing line first and copy its `rid=` value:

```bash
docker compose --project-directory . -f infra/docker/docker-compose.yaml logs backend worker | grep -E ' (ERROR|CRITICAL) '
```

Add `frontend crawlee` to the list of services to include their lines. The frontend's API routes under `/api/` also send the request id back in the `X-Request-ID` response header (every route that checks sign-in or project access, which is nearly all of them). The Network tab of the browser's developer tools shows it for each call.

**Ids in error messages.** When a file upload, a Canvas import, or a website or GitHub import fails, the error text in the app ends with the request id, for example `(ref: 5f3a9c1e0b2d)`. Ask the person who saw the error for that text, then search the logs for `rid=5f3a9c1e0b2d` as above. There is no `(ref: ...)` when the request never reached the server, for example after a network error.

**More detail from one service.** `LOG_LEVEL` sets how much each service writes; the default is `INFO`. To switch the worker to `DEBUG` and leave the backend as it is:

```bash
LOG_LEVEL=DEBUG docker compose --project-directory . -f infra/docker/docker-compose.yaml up -d --no-deps worker
```

This recreates only the worker container. Run the same command without `LOG_LEVEL=DEBUG` to go back. `DEBUG` writes a line for every file, page and Canvas item, so do not leave it on. On the dev stack, put the variable in front of the command instead, for example `LOG_LEVEL=DEBUG python ai_ta_backend/rabbitmq/worker.py`.

The same command works for the frontend: name `frontend` instead of `worker`. The web crawler reads `LOG_LEVEL` from `.env` instead. Set `LOG_LEVEL=DEBUG` there and run `docker compose --project-directory . -f infra/docker/docker-compose.yaml up -d --no-deps crawlee`. Set it back to `INFO` when you are done, because the other services also take the value from `.env` the next time they are recreated.

What each level means is on [Logging](../contributing/logging.md).

## Starting the stack

**`start-all.sh` prints "Database is empty. Re-run with --create-schema".** The database volume is new and the script never applies the schema on its own. Run `start-all.sh --create-schema` once; later runs need no flag. See [Self-Hosting](index.md).

**`start-all.sh` exits with "SIM_APPROVAL_ADMIN_EMAIL is not set in .env" before building anything.** Set it to the address that should become the Sim platform admin, or pass `--no-sim`. The same check runs in `start-dev.sh`.

**`SIM_SSO_DOMAIN must be exactly one registrable domain`.** The value is a list or not a domain. Set exactly one domain, for example `illinois.edu`.

**"Existing database predates the external-connections schema".** The volume was created before the `project_external_connections` table existed. Reset with `--wipe_data` (full stack) or `--clean` (dev), or restore from a [backup](backup-restore.md) taken after upgrading.

**Postgres logs `initdb: error: directory "/var/lib/postgresql/data" exists but is not empty` and `postgres-illinois-chat` never becomes healthy.** The volume was created by v1.0, when the mount point was different. Follow the Postgres volume steps in [Upgrading](upgrading.md).

**`docker-compose.models.yaml` fails with a bind-mount error for `scripts/init-ollama-models.sh`.** The `ollama-models-init` job mounts a script the repository does not contain. Start only the `ollama` service from that file, or remove the job, and pull models with `docker exec ollama ollama pull <model>`.

**`--wipe_data and --create-schema cannot be used together`.** `--wipe_data` already recreates the schema; drop `--create-schema`.

## Stopping the stack

**`stop-all.sh` or `stop-dev.sh` fails with `required variable SIM_… is missing a value`.** The stack was started with `--no-sim`, so `.env` never received the Sim secrets, but the stop script loaded the Sim overlay and Compose interpolates its required variables even for `down`. Stop with `--no-sim` as well.

## Chat and tools

**Every Sim SSO sign-in is refused.** `SIM_SSO_DOMAIN` is a list or does not match the users' email domain. One domain only; see "Who can get in" on [Tools Platform (Sim AI)](sim.md).

**The Tools page says a stored key "could not be read".** `ENCRYPTION_MASTER_KEY` changed since the key was saved, or migration 0017 has not run. Start the stack once (both start scripts replay 0017), then paste the key again.

**The Tools page cannot reach Sim on the full stack.** `.env` still has the template's `SIM_API_BASE_URL=http://localhost:3010`, which inside the frontend container points at the container itself. Set it to `http://simstudio:3000` and restart the frontend; see the [Configuration reference](configuration.md).

**Tools show the "Offline" badge.** No tool-routing model is available to the chatbot: it has no OpenAI-compatible provider or OpenAI key enabled and `NCSA_HOSTED_VLM_BASE_URL` is unset on the frontend. See [Tool routing](../how-it-works/tool-routing.md).

**Canvas import returns 500.** `CANVAS_ACCESS_TOKEN` is not passed by any Compose file; see "Ingest worker" in the [Configuration reference](configuration.md).

**A large export finishes but nobody receives the download link.** The backend's SMTP variables are unset, so the email step fails silently and the file stays in object storage. See "Email (SMTP)" in the [Configuration reference](configuration.md).

**Uploads fail or presigned URLs point at the wrong port.** The app is using the object-storage console port instead of the API port. See "Ports" on [Services, ports & architecture](architecture.md).

**Project settings cannot be loaded: API calls answer 503 "Project metadata store unavailable".** The frontend cannot read the project settings from Redis: Redis is down, or `REDIS_URL` does not reach it. Pages of the project then do not load. The frontend log has one `ERROR` line for each failed request, with the Redis error under `Caused by:`:

```text
2026-11-02T14:05:12.337Z ERROR   api rid=8c41d7a2e9f0 path=/api/UIUC-api/ingest course=ece120 project metadata store unavailable
MetadataUnavailableError: could not read the metadata of project ece120
    at getCourseMetadata (...)
    ...
Caused by: Error: connect ECONNREFUSED 172.18.0.5:6379
```

The first failure also writes `Redis client error:` with the reason, once. Check Redis with `docker compose --project-directory . -f infra/docker/docker-compose.yaml ps redis` and start it again with `docker compose --project-directory . -f infra/docker/docker-compose.yaml up -d --no-deps redis`.

## Development and deployment

**`start-dev.sh` problems** (ports already in use, app `.env` files, Drizzle migrations): see [Development setup](../contributing/dev-setup.md).

**ECS deployments that never become healthy, or that need to be rolled back:** see [Cloud deployment (ECS)](cloud-deployment.md).
