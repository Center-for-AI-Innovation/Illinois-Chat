# Troubleshooting

Symptoms seen on self-hosted stacks, with the page that owns the fix. Sim-specific problems are in "Troubleshooting" on [Tools Platform (Sim AI)](sim.md); problems with external stores are in "Verifying and troubleshooting" on [External connections (operators)](external-connections.md).

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

**Canvas import returns 500.** The reply says `CANVAS_ACCESS_TOKEN is not configured.`: the token is unset. Set it in `.env` (Compose passes it to the backend) and recreate the backend with `docker compose --project-directory . -f infra/docker/docker-compose.yaml up -d --no-deps backend`; see "Backend API" in the [Configuration reference](configuration.md). A 500 that says `Canvas ingest failed: <error type>` is an unexpected error. The reply names only the type of the error, and the backend log has the traceback. One known cause is `Canvas ingest needs S3_BUCKET_NAME, which is unset` in that log: the backend has no bucket name, so set `S3_BUCKET_NAME` (Compose sets it to `uiuc-chat` by default).

**Canvas import returns 400.** The request has no `canvas_url`, or it is not a course link of the form `https://canvas.illinois.edu/courses/<id>`. Copy the link from the course home page in Canvas.

**Canvas import returns 502 "Canvas rejected the configured access token".** Canvas refused the token in `CANVAS_ACCESS_TOKEN`: it is wrong, expired or revoked. The reply passes on what Canvas said:

```json
{
  "error": "Canvas rejected the configured access token",
  "upstream": "canvas",
  "upstream_status": 401,
  "upstream_message": "{\"errors\":[{\"message\":\"Revoked access token.\"}]}"
}
```

`upstream_status` is the status Canvas returned and `upstream_message` the start of its reply as Canvas sent it (up to 500 characters). The backend writes one `ERROR` line from `ai_ta_backend.rabbitmq.ingest_canvas` with the same status and text. Create a new token in Canvas, set it in `.env` and recreate the backend as above. Other 502 replies from a Canvas import have the same shape with a different `error`, for example when the token's Canvas account has no pending invitation to the course, or `Canvas unreachable` when the backend cannot reach Canvas at all (then `upstream_status` is empty). `Canvas ingest queued no documents` means a section failed to download and nothing could be imported; its `section_results` field gives the result for each section.

**Canvas import returns 422.** Canvas answered, but the import found no document to add. The `error` text gives the cause, and `section_results` gives the result for each section:

- `Canvas gives the Illinois Chat account no access to: files, pages.` Canvas answered 401 or 403 for those sections, which `section_results` shows as `No access! Canvas 403 for <path>`. The token is good, but the course does not let the token's account read them, for example because the tab is hidden from students. Ask the instructor to open those sections, or select only the sections the account can read.
- `Canvas import found no documents in the selected sections.` Canvas let the account read the sections, and no document came out of them. Either they are empty (`Success` with no item, or `none found`), or each item was skipped. For skipped items the backend log has the cause: the `skipped=` count of the `section=<name> downloaded=<n> skipped=<n>` line, and a `WARNING` line `section=modules: <n> item(s) failed and were skipped` when an item of a module failed, for example an external link that the backend cannot reach.

The backend writes one `WARNING` line, `canvas ingest found no documents`, with the project, the Canvas course id and the sections with no access. When at least one document is queued, the reply is 200 also if a section had no access; `section_results` still names it.

**A large export finishes but nobody receives the download link.** The backend's SMTP variables are unset, so the email step fails silently and the file stays in object storage. See "Email (SMTP)" in the [Configuration reference](configuration.md).

**Uploads fail or presigned URLs point at the wrong port.** The app is using the object-storage console port instead of the API port. See "Ports" on [Services, ports & architecture](architecture.md).

## Development and deployment

**`start-dev.sh` problems** (ports already in use, app `.env` files, Drizzle migrations): see [Development setup](../contributing/dev-setup.md).

**ECS deployments that never become healthy, or that need to be rolled back:** see [Cloud deployment (ECS)](cloud-deployment.md).
