# Illinois Chat web crawler

The crawling service of [Illinois Chat](https://github.com/Center-for-AI-Innovation/Illinois-Chat), built on [Crawlee](https://crawlee.dev/) with Playwright. The web app sends it a start URL and scope; it crawls, stores crawled files in object storage, and posts each page to the backend's ingest endpoint (`INGEST_URL`).

- What users see: https://docs.chat.illinois.edu/building/dashboard/web-crawling/
- How crawled content is stored: https://docs.chat.illinois.edu/how-it-works/documents-ingest/

## Run from this directory

The full Docker stack runs it as the `crawlee` service. For local development it is not part of the dev compose stack; run it on the host if you need crawling:

```bash
npm install      # also installs the Playwright browsers
npm start        # http://localhost:3345
```

It reads `apps/crawlee/.env`, which `infra/scripts/start-dev.sh` writes.
