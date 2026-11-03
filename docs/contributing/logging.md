# Logging

How the backend, the ingest bridge and the ingest worker write their logs, and the rules for adding a log line. How to read the logs of a running stack is in "Reading the logs" on [Troubleshooting](../self-hosting/troubleshooting.md#reading-the-logs).

## The line

Every service writes plain text, one event per line, in the same field order:

```text
2026-11-02T14:03:01.123Z INFO    ai_ta_backend.rabbitmq.rmqueue rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 queued ingest file=lecture1.pdf
2026-11-02T14:03:09.410Z ERROR   ingest rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 _ingest_single_pdf failed for courses/ece120/lecture1.pdf: PDFSyntaxError: No /Root object
Traceback (most recent call last):
  ...
```

1. The time in UTC, with milliseconds.
2. The level, padded to 7 characters.
3. The logger name: the Python module name, for example `ai_ta_backend.main`, `ingest` or `worker`. There is no service name; the container or the CloudWatch log group already gives it.
4. `rid=` (request id), `job=` (ingest job) and `course=` (project name), each only when it is known.
5. The message. It says what failed and why in plain words, with the exception type and text after a colon. Details go in `key=value` pairs such as `file=`, `status=` and `ms=`.

A newline inside the message is written as `\n`, so a value cannot fake a new log line. A traceback keeps its real newlines and follows on the next lines. A password in a connection URL (`://user:password@`) is written as `://***@`. There is no JSON format and no switch for one.

The format lives in `apps/backend/ai_ta_backend/rabbitmq/log_setup.py`. `main.py`, `bridge.py` and `worker.py` call its `configure_logging()` once at start, which also sets noisy libraries (`urllib3`, `botocore`, `pika`, `pdfminer`, `openai` and others) to `WARNING`. `apps/backend/gunicorn.conf.py` gives gunicorn's own lines the same format; only gunicorn's first "Starting gunicorn" line comes before that and looks different. The module sits in `rabbitmq/` because the worker image contains only that folder. Import it the way `rmqueue.py` imports its neighbours (`try: from ai_ta_backend.rabbitmq.log_setup import ...` / `except ModuleNotFoundError: from log_setup import ...`): a second import name would load a second copy, and the request id would go missing.

`LOG_LEVEL` sets the lowest level a service writes. The default is `INFO`, which is also what production runs. An unknown value falls back to `INFO` with one warning line.

## Levels

- **`DEBUG`**: detail for each item, and sizes of payloads. Off in production. For example one line per page or Canvas item, search timings, retry attempts 2 to 9 of a queued job.
- **`INFO`**: one line per unit of work (a request, a job, a file, a Canvas section) and for lifecycle events (started, connected, config loaded). For example `request method=POST route=/ingest status=200 ms=41`, `Worker connected to RabbitMQ queue=uiuc-chat`, `done handler=_ingest_single_pdf ... result=Success`.
- **`WARNING`**: something unexpected that the code handled: a retry, a fallback, an empty result where content was expected. For example `ingest attempt 1/3 failed`, `no handler for ext=.zip ... trying text fallback`, a Canvas section skipped.
- **`ERROR`**: this request or job failed. Logged once, where the failure is handled, with the cause. For example `done ... result=failed err=...`, `Canvas 401 for /api/v1/users/self: ...`.
- **`CRITICAL`**: the process cannot continue, for example a required variable missing at start.

## Rules

- Every module gets its own logger: `logger = logging.getLogger(__name__)`. No calls on the root logger (`logging.info(...)`), and no `print`: neither has a level, a time or the ids. `worker.py` is the one exception and uses `logging.getLogger('worker')`, because the spawned ingest process imports it as `__mp_main__`.
- Pass values as arguments: `logger.info("queued %d jobs for course=%s", count, course)`, never an f-string.
- Inside an `except` block, use `logger.exception("<what failed> course=%s", course)`. It adds the traceback.
- Log an error once, at the layer that handles it. Lower layers raise or return the error; they do not log it as well.
- Never log tokens, passwords, cookies, connection URLs with credentials, full request bodies, full documents, prompts or email addresses. Log names, lengths, counts and statuses instead.
- Cut text from other services to 500 characters before logging it: `response.text[:500]`.
- The request line keeps the key names `route=` and `ms=`; saved CloudWatch queries read them.
- Leave existing `sentry.capture_exception(e)` calls next to `logger.exception`. Sentry counts the two as one event.

## How the request id travels

One id follows an upload from the browser to the worker, so one search for `rid=<id>` across the containers shows the whole story.

1. The upload area in the browser makes an id for each file and sends it in the `X-Request-ID` header of the call to the Next.js API.
2. The Next.js API route reads that header, or makes an id, and forwards it to the backend.
3. Flask (`install_request_logging` in `log_setup.py`, used by `main.py` and `bridge.py`) takes the `X-Request-ID` header when it is 1 to 64 letters, digits, `-` or `_`, and otherwise makes a 12-character id. It writes one `INFO` request line per request (not for `/health` and `/api/healthcheck`) and sends the id back in the `X-Request-ID` response header.
4. `rmqueue.addJobToIngestQueue` puts the id into the queue message as `request_id`. A job that is re-queued keeps it.
5. The worker binds `rid`, `job` and `course` for the whole job. The spawned ingest process receives the id as an argument and binds it again, because the context does not cross into a new process.

Background tasks started from a request (Flask-Executor threads and the process pool) get the request's context when they are submitted, so their lines carry the same `rid=`. A background task that raises is logged as `background task <name> failed`.

## Repeats and gaps that are expected

- When an ingest handler raises, one file gives two `ERROR` lines: the traceback from the handler's `except`, then the one-line summary `done handler=... result=failed err=... ms=...`. Every failed file gets that summary line, including handlers that fail without raising.
- The worker tries a failing file 3 times in the same job (`main_ingest`), so one failing file can give up to 3 `ERROR` blocks, with a `WARNING` for each failed attempt.
- Lines written inside `loop.run_in_executor` threads (the retrieval code) carry no `rid=`.
- Jobs queued before the request id existed have no `request_id`, so their lines carry no `rid=`.
- On macOS the process pool starts new processes instead of copying the parent, so lines from export tasks run on a laptop lose the format. Linux containers are not affected.

## Node

The Next.js frontend and the web crawler (crawlee) are written in TypeScript. The frontend's server code has a small logger that writes the same line as the Python services. The crawler uses crawlee's own logger, and its line looks a little different.

### Frontend: the logger

Server code (API routes, `src/server/`, the chat provider code in `src/app/utils/`) logs through `getLogger(scope)` from `apps/frontend/src/utils/server/log.ts`:

```ts
import { getLogger } from '~/utils/server/log'

const log = getLogger('api.ingest')

log.info('submitted to ingest queue', { file: s3_filepath, status: response.status })
log.error('ingest submission failed', { file: uniqueFileName }, error)
log.error('ingest submission failed', error)
```

- The scope is a short dotted name for the area, for example `api.ingest`, `api.scrapeWeb`, `server.authorization` or `llm.anthropic`. It takes the place of the Python module name.
- The arguments are the message, then an object of fields, then the error. Without fields, the error can come second. Each field is written as `key=value` after the message; a field that is `undefined` or `null` is left out.
- Put details in the fields, not in the message, so they can be searched as `key=value`.
- Inside a route that checks project access, `course=` is already on every line. Do not pass `course` in the fields as well, or it is written twice. Pass it only in code that runs outside such a route.

A line looks like this:

```text
2026-11-02T14:03:01.050Z INFO    api.ingest rid=5f3a9c1e0b2d path=/api/UIUC-api/ingest course=ece120 submitted to ingest queue file=courses/ece120/5f3a9c1e-0b2d-4c1a-9e2f-3b7d6a8c1f04-lecture1.pdf status=200 task_id=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17
2026-11-02T14:07:44.912Z ERROR   backendFetch rid=8c41d7a2e9f0 path=/api/UIUC-api/ingest course=ece120 backend 500 POST /ingest ms=812 body={"error":"..."}
```

The fields are the same as in Python, with `path=` (the API route, without the query string) where Python has `job=`. An error follows on the next lines as `Name: message` and its stack frames. If the error has a `cause`, it follows as `Caused by: Name: message`. Newlines inside the message and the fields are written as `\n`.

`log.debug`, `log.info`, `log.warn` and `log.error` write `DEBUG`, `INFO`, `WARNING` and `ERROR`. The level names mean the same as for Python (see "Levels" above). `LOG_LEVEL` sets the lowest level that is written; it is read on every call. A missing or unknown value means `INFO`, without a warning line. Every event is one `console` call with one string (`console.log` for `DEBUG` and `INFO`, `console.warn`, `console.error`), so a test can spy on `console.error`.

`log.ts` and `requestContext.ts` are meant for server code, but some of that code is also bundled for the browser. In the browser there is no request context, and a line is a timestamped `console` message without ids. For this to work, `requestContext.ts` imports `async_hooks` by its bare name, which `next.config.mjs` replaces with an empty module in the browser. Do not change it to `node:async_hooks`: that form cannot be replaced.

### Frontend: the request id

1. The upload area (`LargeDropzone.tsx`) makes one id per file: the first 12 hex characters of the uuid that also starts the file's S3 name. It sends the id in the `X-Request-ID` header of the calls to `/api/UIUC-api/uploadToS3` and `/api/UIUC-api/ingest`. It does not send it on the upload to the bucket itself: a custom header there makes the browser ask the bucket for CORS permission first, and the bucket refuses.
2. The route wrappers open the request context: `withAuth` (`src/utils/authMiddleware.ts`), `withAppRouterAuth` (`src/utils/appRouterAuth.ts`) and the two `withCourseAccessFromRequest` versions (`src/server/authorization.ts`, `src/app/api/authorization.ts`). They take the `X-Request-ID` header when it is 1 to 64 letters, digits, `-` or `_`, and otherwise make a 12-character id. The context holds `rid`, `path` and, once a project access check knows it, `course`. A wrapper writes an id it made back onto the request, and sends the id back in the `X-Request-ID` response header. A wrapper inside another one uses the context that is already open. The shared code is in `src/utils/server/routeContext.ts`. Routes without a wrapper (`healthcheck`, `auth/*`) have no request id.
3. `backendFetch(url, init)` (`src/utils/server/backendFetch.ts`) is `fetch` for calls to the backend. It adds the `X-Request-ID` header and measures the time. When the backend answers with an error status, it writes one `ERROR` line `backend <status> <method> <path> ms=<n> body=<text>`, with the first 500 characters of the reply, and returns the response unchanged. The ingest path uses it (`UIUC-api/ingest.ts`, `ingestCanvas.ts`, `chat-file-upload.ts`, `deleteDocument.ts`). The other backend calls still use plain `fetch` and do not forward the id.
4. `scrapeWeb.ts` sends the id to the crawler in the `X-Request-ID` header. The crawler sends it on with every page it passes to the backend's `/ingest`.

### Frontend: errors in API routes

The wrappers catch anything a route handler throws. The route then answers:

- **500** with `{"error": "Internal server error", "message": "The server hit an unexpected error."}`, and the log gets one `ERROR` line `unhandled error in API route` with the stack. A bug in a handler is no longer reported as a failed sign-in (401).
- **503** with `{"error": "Project metadata store unavailable", "message": "Project settings could not be loaded. Try again shortly."}` when the project settings cannot be read from Redis. The log gets one `ERROR` line `project metadata store unavailable`. Before, such a request answered 404 `Project not found`. See [Troubleshooting](../self-hosting/troubleshooting.md).

Both lines use the scope `api`. If the handler had already started its reply, the status cannot change, and the reply is closed.

Log one `ERROR` per failure. The code that handles the failure (usually the route, or the wrapper's catch-all) writes the `ERROR` with the stack. An inner step that catches an error and throws it on writes at most a `WARNING` with the step's name and no stack. For example, when the backend refuses an ingest, `backendFetch` writes the `ERROR` with the status and the reply, and the ingest route adds only a `WARNING` `ingest not queued`.

### Frontend: where `console` is still used

ESLint warns about `console` (`no-console`) in `src/pages/api/`, `src/app/api/`, `src/server/`, `src/app/utils/` and `src/utils/server/`, but not in tests. `log.ts` turns the rule off for itself, because it is the one place that writes to the console. The other server-only files in `src/utils/` (`authMiddleware.ts`, `appRouterAuth.ts`, `redisClient.ts`) are not covered by the rule; use the logger there too. `redisClient.ts` keeps its one `Redis client error:` line, written once per process.

Four shared files keep `console`: `src/utils/streamProcessing.ts`, `src/utils/functionCalling/handleFunctionCalling.ts`, `src/utils/fetchContexts.ts` and `src/utils/apiUtils.ts`. Their code runs in the browser most of the time, where the logger has no request id to add. `src/utils/server/index.ts` is also bundled for the browser and keeps one `console.debug` line; it is the one `no-console` warning left.

### Crawler

The crawler (`apps/crawlee`) uses crawlee's own logger (`import { log } from 'crawlee'`). `apps/crawlee/src/logSetup.ts` sets it up; `main.ts` must import it first, so that lines written while other modules load are formatted too. A line looks like this:

```text
2026-11-03 00:16:29.261 INFO  rid=3c9e51b07a24 course=ece120: crawl started url=https://ece.illinois.edu/ strategy=same-hostname maxPages=50
2026-11-03 00:16:41.907 WARN  rid=3c9e51b07a24 course=ece120: Page failed after all retries url=https://ece.illinois.edu/old-page: Error: ...
```

It differs from the other services:

- The time is UTC too, but has a space instead of `T` and no `Z`.
- The level names are short (`DEBUG`, `INFO`, `WARN`, `ERROR`) and padded to 5 characters.
- There is no logger name. Each crawl gets a child logger whose prefix is `rid=<id> course=<name>`; the prefix ends with `:`.

`POST /crawl` takes the `X-Request-ID` header under the same rule as the other services, or makes a 12-character id, and sends the id back in the `X-Request-ID` response header. It writes one `INFO` line when a crawl starts (`crawl started`) and one when it ends (`crawl done pages=<n> ms=<n>`). A failed crawl gives one `ERROR` line `crawl failed ms=<n>` with the stack (for invalid parameters, only the message), and a 500 reply with `error`, `errorTitle` and `errorMessage`; `scrapeWeb.ts` shows `errorMessage` to the user. A page that still fails after its retries gives a `WARN` line, and a page the backend's `/ingest` refuses gives an `ERROR` with the URL, the status and the first 500 characters of the reply. Lines for each page are `DEBUG`. Values from requests and web pages are kept on one line (`oneLine()` in `logSetup.ts`).

`logSetup.ts` maps `LOG_LEVEL` to crawlee's own level setting (`APIFY_LOG_LEVEL`). An unknown value falls back to `INFO` with one warning line. In Compose the crawler gets `LOG_LEVEL` from `.env` through `env_file`, not from its `environment:` list like the other services. On the dev stack, put it in `apps/crawlee/.env`. The Docker image sets `FORCE_COLOR=0`, so the container output has no colour codes.

In CloudWatch, the crawler is the one service that must not get the `awslogs-datetime-format` option (`%Y-%m-%dT%H:%M:%S`). Its lines have a space where that format expects `T`, so no line would match, and the whole output would be joined into one event.
