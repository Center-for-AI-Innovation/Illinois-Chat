# Sim AI developer guide

How the Sim AI deployment is put together, how Illinois Chat talks to it, and what to know
before changing or upgrading it.

If you build tools in Sim rather than maintain the deployment, read the
[Sim user guide](sim-user-guide.md) instead.

## 1. What runs

Sim is deployed from **upstream container images only** — there is no Sim source checkout
and no fork. The stack is defined in `infra/docker/docker-compose.sim.yaml`, layered on top
of `infra/docker/docker-compose.dev.yaml`:

| Service | Purpose | Local port |
|---|---|---|
| `simstudio` | The Sim app | 3010 |
| `sim-realtime` | Collaborative editing socket server | 3011 |
| `sim-db` | Sim's own Postgres (pgvector image), isolated from the app database | 55432 |
| `sim-migrations` | Runs Sim's schema migrations, then exits | — |
| `sim-approval-setup` | Installs the user approval gate, then exits | — |
| `sim-keycloak-setup` | Creates/updates the Sim OIDC client in Keycloak, then exits | — |
| `sim-sso-setup` | Registers the SSO provider inside Sim, then exits | — |

Sim keeps its **own database**, separate from Illinois Chat's. Nothing in Sim writes to the
app's Postgres.

### Images are pinned by digest, deliberately

`SIM_APP_IMAGE`, `SIM_REALTIME_IMAGE` and `SIM_MIGRATIONS_IMAGE` pin exact digests rather
than tracking a tag. This is not incidental: the approval gate patches Sim's own `user`
table, so an unreviewed upgrade could break it — or silently open it. See section 6.

The pinned app image is **Sim v0.8.4**, built from upstream commit `e741923f` on
2026-08-18. Knowing this matters more than it sounds; see the caveat in section 8.

## 2. Running it locally

```bash
bash infra/scripts/start-dev.sh              # app stack + Sim
bash infra/scripts/start-dev.sh --no-sim     # app stack only
bash infra/scripts/stop-dev.sh               # stop everything
bash infra/scripts/stop-dev.sh --no-sim      # stop the app stack, leave Sim alone
```

The scripts always invoke Compose as `--project-directory . -f <dev file> -f <sim file>`
from the repository root. Reproduce that exactly if you run Compose by hand; the Sim file
has no top-level `networks:` key of its own and will not parse standalone.

### Secrets

Six values have no defaults and the stack refuses to start without them:
`SIM_POSTGRES_PASSWORD`, `SIM_BETTER_AUTH_SECRET`, `SIM_ENCRYPTION_KEY`,
`SIM_API_ENCRYPTION_KEY` (exactly 64 hex characters), `SIM_INTERNAL_API_SECRET` and
`SIM_KEYCLOAK_CLIENT_SECRET`. The start scripts generate deployment-specific values into
the root `.env` on first run.

**Never let these regenerate where real data lives.** `SIM_ENCRYPTION_KEY` and
`SIM_API_ENCRYPTION_KEY` are what make stored Sim data and API keys readable; regenerating
them invalidates sessions and makes previously encrypted data undecryptable.

`SIM_APPROVAL_ADMIN_EMAIL` is also required — it names the bootstrap platform admin.

### One sharp edge

`SIM_SSO_DOMAIN` takes **a single registrable domain**, not a list. A comma-separated value
normalises to nothing and denies every sign-in, and `start-dev.sh` refuses to start on one.
Set it to `illinois.edu` and nothing else.

## 3. How Illinois Chat talks to Sim

Credentials are **per project**, stored server-side, and never accepted from the caller. A
project admin pastes a Sim API key (`sk-sim-…`) and workspace ID on the project's Tools
page; the key is encrypted at rest with `ENCRYPTION_MASTER_KEY`.

The relevant code:

| File | Role |
|---|---|
| `apps/frontend/src/utils/simConfig.ts` | Resolves and decrypts per-project credentials; caches briefly; validates the base URL |
| `apps/frontend/src/utils/simDiscovery.ts` | Lists a workspace's **deployed** workflows and turns them into LLM tool definitions |
| `apps/frontend/src/pages/api/UIUC-api/getSimWorkflows.ts` | Tools-page listing endpoint |
| `apps/frontend/src/pages/api/UIUC-api/runSimWorkflow.ts` | Executes a workflow |
| `apps/frontend/src/components/UIUC-Components/SimPage.tsx` | The project Tools page |

Four things worth knowing before you change any of it:

- **Discovery is deployed-only.** A workflow that exists but is not deployed is invisible to
  Illinois Chat. A workflow whose inputs have no descriptions is skipped and reported,
  rather than published with a guessed signature.
- **Execution is authorised against the same listing**, so a hand-crafted workflow ID cannot
  spend a project's key on an undeployed or unrelated workflow.
- **Reserved control fields are stripped** from both advertised schemas and model-generated
  input, so the model cannot reach Sim execution internals through tool arguments.
- **Outbound Sim URLs are allowlisted** (an SSRF guard): sim.ai hosts, local hosts, the
  origin of `SIM_API_BASE_URL`, and anything in `SIM_ALLOWED_SIM_ORIGINS`. Project admins
  choose from that set but cannot add to it.

## 4. Who can get in

Two independent gates:

1. **Keycloak SSO**, restricted to the single domain in `SIM_SSO_DOMAIN`. Sim shares the
   app's realm, so there is no separate Sim password.
2. **A per-user approval gate** in Sim's database (`infra/docker/sim/approval-setup.sql`).
   Every first sign-in lands in `pending` until a platform admin approves it. Blocking
   revokes live sessions immediately.

The gate lives in the database precisely so we can keep using upstream images unmodified.
The user guide covers the admin workflow.

## 5. The block whitelist

`ALLOWED_INTEGRATIONS` in the Sim compose file restricts which block types users may place
in a workflow. The full list ships as the compose default; `.env.template` carries only a
commented marker. The allowed set is documented for builders in section 5 of the user guide.

**Six properties, all verified against the source at our pinned commit.** Do not assume the
public documentation applies — it describes a newer release that behaves differently:

- It works **on its own**. No `ACCESS_CONTROL_ENABLED`, organization, or enterprise plan.
- Matching is an **exact lowercased string compare with no version resolution**. `slack`
  does not permit `slack_v2`. Write ids exactly as the registry spells them.
- **Core blocks are not exempt.** Only the start trigger and hidden legacy blocks are. Omit
  `agent` or `function` and every workflow fails at its first block.
- Enforcement happens **at execution, not at save**, so a workflow containing a denied block
  can still be saved or imported and fails only on a run.
- **A denied vendor attached as an agent tool is dropped silently.** The error is swallowed;
  the agent runs without that tool and nobody sees an error. Expect this as a support
  report, not a crash.
- **A value Sim receives as empty means unrestricted**, so it fails open. Leaving
  `SIM_ALLOWED_INTEGRATIONS` blank in `.env` is safe because the compose default applies,
  but deleting the compose key removes the restriction entirely.

### Changing the list

Edit the default in `infra/docker/docker-compose.sim.yaml` and recreate the service. Before
committing, confirm the value has no duplicates and the expected field count, and that every
id exists in the running image's block registry. To roll back, comment the key out and
recreate — clearing the `.env` variable does nothing.

Two things this variable **cannot** do: disable MCP tools or custom tools. Those are
permission-group settings with no environment equivalent. `ALLOWED_MCP_DOMAINS` restricts
which hosts an MCP server may point at, and we currently set none.

## 6. Upgrading Sim

1. Resolve the new digest:
   `docker buildx imagetools inspect ghcr.io/simstudioai/simstudio:latest`
2. Set `SIM_APP_IMAGE` and the matching `SIM_REALTIME_IMAGE` / `SIM_MIGRATIONS_IMAGE`.
3. **Re-check the approval gate.** It patches Sim's `user` table; an upstream schema change
   could break or bypass it.
4. **Re-check the whitelist.** Every id must still exist in the new image. More subtly,
   upstream later resolves block versions to their successors, which would make an allowed
   id silently permit newer variants — widening the list without anyone editing it.
5. Re-read the block registry and the access-control helpers if either check is unclear.

Treat an upgrade as a reviewed change, not a routine bump.

## 7. Troubleshooting

**`stop-dev.sh` fails with "required variable SIM_… is missing a value".** Compose
interpolates the whole merged file even for `down`, and the Sim services mark their secrets
as required. Your `.env` lacks them. Use `stop-dev.sh --no-sim`, which skips the Sim overlay
entirely.

**Every SSO sign-in is refused.** Check `SIM_SSO_DOMAIN` is one domain, not a list.

**The Tools page says a stored key "could not be read".** `ENCRYPTION_MASTER_KEY` changed
since the key was saved, or a migration is missing. Paste the key again.

**A Connect button opens and closes immediately.** That integration needs a deployment-wide
OAuth client we have not registered. This is expected; see the user guide.

**An agent quietly stopped using a tool.** Most likely that vendor is not on the whitelist.
Check the container log for `Integration blocked by env allowlist` alongside
`[AgentHandler] Error creating tool`.

## 8. Sim's own documentation, and how far to trust it

Start here for anything not covered above:

- [Self-hosting overview](https://docs.sim.ai/platform/self-hosting/environment-variables) —
  the full environment variable reference.
- [Integrations and OAuth](https://docs.sim.ai/platform/self-hosting/integrations-oauth) —
  which providers need which `*_CLIENT_ID` / `*_CLIENT_SECRET` pairs, and the callback URL
  shape. Read this before registering any vendor application.
- [Security and hardening](https://docs.sim.ai/platform/self-hosting/security) — the SSRF
  boundary, egress allowlists, and where user code runs.
- [Sandboxes](https://docs.sim.ai/platform/self-hosting/sandboxes) — relevant because we run
  the **default in-process sandbox**: Function block code executes inside the app container
  with no network or filesystem separation. Anyone who can author a workflow runs code in
  that container's security context. Accepted for now given the approval gate.
- [Authentication](https://docs.sim.ai/platform/self-hosting/authentication) — signup
  restrictions and SSO options.
- [Access control](https://docs.sim.ai/platform/enterprise/access-control) — permission
  groups, and the only documentation of `ALLOWED_INTEGRATIONS`.

**Treat these pages as indicative, not authoritative for this deployment.** They track
Sim's latest release; we run a pinned, older one. During this work several documented
behaviours turned out to differ from what our version actually does — including how the
block allowlist matches ids and which blocks it exempts. When a detail matters, read the
source at our pinned commit rather than the docs:

```
https://github.com/simstudioai/sim/tree/e741923f
```

The block registry (`apps/sim/blocks/`), the environment flag parsing
(`apps/sim/lib/core/config/`) and the executor (`apps/sim/executor/`) are the three places
worth knowing how to find.
