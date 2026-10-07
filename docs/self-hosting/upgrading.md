# Upgrading

How to move a self-hosted stack from one release to the next. Each release has one section; read the one for the version you are moving to. Tags and release notes are on the [repository's releases page](https://github.com/Center-for-AI-Innovation/Illinois-Chat/releases).

The general procedure is the same for every release:

```bash
git fetch origin
git checkout v1.1          # the tag you are upgrading to
bash infra/scripts/start-all.sh
```

`start-all.sh` rebuilds the images, replays the schema steps it owns and leaves the volumes alone. Take a [backup](backup-restore.md) first.

## v1.0 → v1.1

Tools and the Postgres volume work differently than they did in v1.0.

**Tools platform.** n8n is removed; recreate every tool in Sim (see [Build a Tool in Sim](../building/tools/build-a-tool.md)). The stack now starts Sim with the app, so before the first start:

- Set `SIM_APPROVAL_ADMIN_EMAIL` in `.env`; `start-all.sh` exits without it. Pass `--no-sim` to run without Sim.
- `SIM_SSO_DOMAIN` must be a single domain. A comma-separated list denies every Sim sign-in.
- `SIM_*` secrets have no published defaults; the start script generates them into `.env` on first run.
- `ENCRYPTION_MASTER_KEY` now also encrypts each chatbot's Sim API key (same key as external connections). The script generates one if `.env` has none.
- Set `SIM_API_BASE_URL=http://simstudio:3000` in `.env` on the full stack; the template value `http://localhost:3010` is for local development.

After the start, open Sim and approve builders under **Settings → Admin**, then reconnect each chatbot's Tools page with a Sim API key and workspace ID. `stop-all.sh --no-sim` and `stop-dev.sh --no-sim` leave Sim running.

**Database.** Drizzle migrations 0016 and 0017 must run; 0016 adds the Sim columns and 0017 converts `projects.sim_api_key` to its encrypted form. Both start scripts apply them on every boot, so nothing is needed beyond starting the stack. Other pending migrations are applied with `npm run db:migrate` from `apps/frontend` (see the [Configuration reference](configuration.md)).

**Postgres volume.** The `postgres-illinois-chat` volume is now mounted at `/var/lib/postgresql/data`. A volume created by v1.0 was mounted one level up, so the real cluster lived in an anonymous volume and the named volume holds only an empty `data/` directory. Starting v1.1 on such a volume fails with Postgres's `initdb: error: directory "/var/lib/postgresql/data" exists but is not empty`. Pick one:

- **No data to keep:** reset with `start-all.sh --wipe_data` (or `stop-all.sh --volumes`, then start with `--create-schema`).
- **Data to keep:** stop the stack, find the old anonymous volume with `docker volume ls -qf dangling=true` (a 64-character name), then copy it into place before starting again:

```bash
docker run --rm \
  -v <that-volume>:/from \
  -v <project>_postgres-illinois-chat:/to \
  alpine sh -c 'rmdir /to/data && cp -a /from/. /to/'
```

`<project>` is the Compose project name, by default the repository folder name. `postgres-keycloak` is pinned to `postgres:18`, which is what the unpinned tag already resolved to, so Keycloak's data needs no migration.

**Frontend Node image** is Node 22. Contributors need Node 20.19+ or 22.12+.

**Chatbots with external stores.** `npm run db:migrate` touches only the host database; apply the external migrations as described in [External connections (operators)](external-connections.md).

**Sim itself** is pinned by image digest and does not move with an Illinois Chat release. To take a newer Sim, follow "Upgrading Sim" in [Tools Platform (Sim AI)](sim.md).
