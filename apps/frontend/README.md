# Illinois Chat frontend

The Next.js web application of [Illinois Chat](https://github.com/Center-for-AI-Innovation/Illinois-Chat): the chat interface, the builder screens, the public Chat API and most of the product logic, including pgvector retrieval through Drizzle.

- Documentation: https://docs.chat.illinois.edu/
- Running it locally: https://docs.chat.illinois.edu/contributing/dev-setup/
- Chat API: https://docs.chat.illinois.edu/api/

Built with Next.js 16 and React 19, Tailwind CSS 4 and shadcn/ui on Base UI, Drizzle ORM on Postgres, and Keycloak for authentication.

## Run from this directory

With the dev infrastructure started by `infra/scripts/start-dev.sh`:

```bash
nvm use          # .nvmrc pins Node 22.12; 20.19+ also works
npm ci
npm run local    # http://localhost:3000
```

Useful scripts: `npm run typecheck`, `npm test`, `npm run db:generate` / `db:migrate` / `db:studio` (Drizzle). The app reads `apps/frontend/.env`, which `start-dev.sh` writes; see [Development setup](https://docs.chat.illinois.edu/contributing/dev-setup/) for the values you must fill in.
