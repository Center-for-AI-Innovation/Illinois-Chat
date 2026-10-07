# Development setup

The development guide lives in the documentation site:

**https://docs.chat.illinois.edu/contributing/dev-setup/** (source: `docs/contributing/dev-setup.md`)

In short:

1. Clone the repository, `cp .env.template .env`, and set `SIM_APPROVAL_ADMIN_EMAIL` (or plan to start with `--no-sim`).
2. Install packages: a Python 3.10/3.11 virtualenv in `apps/backend` with both `requirements.txt` files; `npm ci` in `apps/frontend` (Node 20.19+ or 22.12+); optionally `npm install` in `apps/crawlee`.
3. `bash infra/scripts/start-dev.sh --create-schema` on the first run.
4. Set `EMBEDDING_MODEL`, `EMBEDDING_API_BASE` and, if needed, an API key in both `apps/backend/.env` and `apps/frontend/.env`.
5. Run the Flask backend, the ingest worker and `npm run local` in separate terminals.

Everything else — services and ports, Drizzle migrations, troubleshooting, stopping — is on that page.
