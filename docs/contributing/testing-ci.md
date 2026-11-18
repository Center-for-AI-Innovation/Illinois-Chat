# Testing & CI

Three GitHub Actions workflows live in `.github/workflows`. Pull requests run checks; pushes to `main` deploy.

## Pull request checks (`pr-checks.yml`)

Runs on pull requests into `main` (and the legacy `monorepo` / `illinois-chat` branches), as one job:

1. **Trunk** lints only the files the PR changed (`check-mode: pull_request`). Everything outside `apps/frontend` is ignored in `.trunk/trunk.yaml`, so only frontend issues surface.
2. **Backend tests**: `astral-sh/setup-uv` installs uv, then `uv sync --frozen --all-extras` and `uv run --frozen pytest` run in `apps/backend`.
3. **Node 20** is set up and `npm ci` runs in `apps/frontend`.
4. `npm run typecheck` type-checks shipped source against `tsconfig.build.json` (test files are excluded; `npm run typecheck:all` covers them locally).
5. `npm run test:coverage:check` runs Vitest with coverage and then `scripts/check-coverage.mjs`, which fails if a watched folder drops below its line-coverage floor (for example `src/utils` 100 %, `src/pages/api` 90 %).
6. **Backend images**: `Self-Hosted-Dockerfile` and `ai_ta_backend/rabbitmq/Dockerfile` are built from `apps/backend` without being pushed, so a broken Dockerfile fails the PR.

### Local equivalents

```bash
cd apps/frontend
npm ci
npm exec trunk check          # lint
npm run typecheck             # shipped source
npm run typecheck:all         # including tests
npm run test                  # Vitest, watch mode
npm run test:coverage:check   # what CI runs
```

Backend tests run in the same job: `uv sync --frozen --all-extras` then `uv run --frozen pytest` in `apps/backend` (`--frozen` fails the job if `pyproject.toml` changed without re-locking). The job also builds the backend and worker images without pushing them. Locally, `uv run pytest` from `apps/backend` runs the same suite.

## Deploy (`illinois-chat-dev.yml`)

Runs on pushes to `main` that touch `apps/**`, `infra/**` or `.github/workflows/**`: Trunk on the pushed commits, then builds and pushes the backend, worker, frontend and Crawlee images to ECR and forces a new deployment of the four ECS services. Details and required secrets are on [Cloud deployment](../self-hosting/cloud-deployment.md). A fourth workflow, `release-images.yml`, builds the same images when a GitHub release is published.

## Docs (`docs.yml`)

Runs when `docs/**`, `overrides/**`, `mkdocs.yml` or the workflow itself change: on pull requests it runs `uv sync --frozen --only-group docs` and `uv run --frozen mkdocs build --strict` as a check; on pushes to `main` (and manual dispatch) it also deploys the built site to GitHub Pages. A broken link or anchor therefore fails the PR check, the same way it fails the local build described on [Writing docs](writing-docs.md).
