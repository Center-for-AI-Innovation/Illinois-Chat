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

**Canvas import returns 500.** `CANVAS_ACCESS_TOKEN` is not passed by any Compose file; see "Ingest worker" in the [Configuration reference](configuration.md).

**A large export finishes but nobody receives the download link.** The backend's SMTP variables are unset, so the email step fails silently and the file stays in object storage. See "Email (SMTP)" in the [Configuration reference](configuration.md).

**Uploads fail or presigned URLs point at the wrong port.** The app is using the object-storage console port instead of the API port. See "Ports" on [Services, ports & architecture](architecture.md).

## Development and deployment

**`start-dev.sh` problems** (ports already in use, app `.env` files, Drizzle migrations): see [Development setup](../contributing/dev-setup.md).

**ECS deployments that never become healthy, or that need to be rolled back:** see [Cloud deployment (ECS)](cloud-deployment.md).
