# [UIUC.chat](https://uiuc.chat)'s Web Crawler

### It's powered by the excellent Crawlee.dev

- [Documentation](https://crawlee.dev/api/playwright-crawler/class/PlaywrightCrawler)
- [Examples](https://crawlee.dev/docs/examples/playwright-crawler)

## What it does

`POST /crawl` (bearer-authenticated) starts a Playwright crawl of one site. For each
page it reaches, it posts the extracted text to the backend's `/ingest`. For each
link whose path ends in `.pdf`, it posts **the URL** to `/ingest` with
`fetch_from_url: true` and nothing else — no file body, no S3 key.

```
frontend /api/scrapeWeb ──Bearer CRAWLEE_API_KEY──▶ POST /crawl
    page HTML  ──▶ POST {INGEST_URL} { content, url, base_url, … }
    PDF link   ──▶ POST {INGEST_URL} { url, base_url, readable_filename, fetch_from_url: true }
                        └─▶ the ingest worker downloads the PDF and stores it in
                            the bucket it resolved for that project
```

The crawler used to download crawled PDFs and upload them to S3 itself, using a
single env-configured bucket. Projects that bring their own S3 bucket made that
wrong: the worker reads from the *project's* bucket, so those PDFs were written
where nobody looked and their citations 404'd. Moving the fetch into the worker
makes the writer and the reader the same process, and means this service holds no
tenant credentials — it has no AWS or MinIO configuration at all.

A PDF linked from many pages is enqueued once per crawl (an in-memory seen-set);
deduplication *across* crawls is the worker's exact-URL check against `documents`.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CRAWLEE_API_KEY` | **yes** | Bearer token required on `POST /crawl`. Unset ⇒ every crawl request gets 503. Must match what the frontend and `rerun_webcrawl_for_project.py` send. |
| `INGEST_URL` | **yes** | Where ingest jobs are posted, e.g. `http://backend:8001/ingest`. |
| `INGEST_API_KEY` | no | Sent as `Authorization: Bearer …` to `INGEST_URL` when set. The backend fails open when *it* has no key, so this can stay empty until the backend enforces it — but then it must match exactly. |
| `PORT` | no | Listen port (default 3000). |
| `NO_CRAWL` | no | `true` skips the actual crawl; useful locally. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | no | Use a preinstalled Chromium rather than downloading one. |

`GET /api/health` is unauthenticated.

## Development

```bash
npm ci --ignore-scripts   # --ignore-scripts skips the Playwright browser download
npm run typecheck
npm test                  # node:test via tsx; covers auth.ts and ingestClient.ts only
npm run start:dev
```

The tests deliberately import nothing from `crawlee` or `playwright`, so they run
against an `--ignore-scripts` install in CI.
