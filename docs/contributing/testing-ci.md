# Testing & CI

Three GitHub Actions workflows live in `.github/workflows`. Pull requests run checks; pushes to `main` deploy.

## Pull request checks (`pr-checks.yml`)

Runs on pull requests into `main` (and the legacy `monorepo` / `illinois-chat` branches). The `trunk-and-tests` job runs these steps in order:

1. **Trunk** lints only the files the PR changed (`check-mode: pull_request`). Everything outside `apps/frontend` is ignored in `.trunk/trunk.yaml`, so only frontend issues surface.
2. **Backend tests**: a placeholder step for now; no backend tests run in CI yet.
3. **Node 20** is set up and `npm ci` runs in `apps/frontend`.
4. `npm run typecheck` type-checks shipped source against `tsconfig.build.json` (test files are excluded; `npm run typecheck:all` covers them locally).
5. `npm run test:coverage:check` runs Vitest with coverage and then `scripts/check-coverage.mjs`, which fails if a watched folder drops below its line-coverage floor (for example `src/utils` 100 %, `src/pages/api` 90 %).

A second job, `backend-images`, runs beside it when the PR changes `apps/backend/**`, `infra/docker/docker-compose.yaml` or one of the workflows that build images. For each of `Self-Hosted-Dockerfile` (API) and `ai_ta_backend/rabbitmq/Dockerfile` (worker) it:

1. Builds the image from `apps/backend` without pushing it. Both Dockerfiles install with `uv sync --locked`, so the build fails if `pyproject.toml` was edited without re-running `uv lock`.
2. Runs `apps/backend/tests/image_smoke.py` inside the image with no network. The script imports the process's entrypoint and exercises the code paths whose packages are imported lazily (the `transformers` tokenizer behind non-ada embedding models, the chat-upload fallback loaders, the worker's document loaders, tesseract, ffmpeg, git and the baked-in NLTK data). Each image holds only its own extra (`api` or `worker`), so this is where a dependency declared in the wrong extra shows up.

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

Backend tests live in `apps/backend/tests` but are not wired into CI yet. Run them locally from `apps/backend`:

```bash
uv sync --locked --all-extras   # fails if uv.lock is out of date with pyproject.toml
uv run pytest
```

To run the image check locally:

```bash
docker build -f apps/backend/Self-Hosted-Dockerfile -t ic-backend:local apps/backend
docker run --rm -i --network none ic-backend:local python - api < apps/backend/tests/image_smoke.py

docker build -f apps/backend/ai_ta_backend/rabbitmq/Dockerfile -t ic-worker:local apps/backend
docker run --rm -i --network none ic-worker:local python - worker < apps/backend/tests/image_smoke.py
```

## Deploy (`illinois-chat-dev.yml`)

Runs on pushes to `main` that touch `apps/**`, `infra/**` or `.github/workflows/**`: Trunk on the pushed commits, then builds and pushes the backend, worker, frontend and Crawlee images to ECR and forces a new deployment of the four ECS services. Details and required secrets are on [Cloud deployment](../self-hosting/cloud-deployment.md). A fourth workflow, `release-images.yml`, builds the same images when a GitHub release is published.

## Docs (`docs.yml`)

Runs when `docs/**`, `overrides/**`, `mkdocs.yml` or the workflow itself change: on pull requests it runs `uv sync --frozen --only-group docs` and `uv run --frozen mkdocs build --strict` as a check; on pushes to `main` (and manual dispatch) it also deploys the built site to GitHub Pages. A broken link or anchor therefore fails the PR check, the same way it fails the local build described on [Writing docs](writing-docs.md).
