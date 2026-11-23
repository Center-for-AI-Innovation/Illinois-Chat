# Logging

How the backend, the ingest bridge, the ingest worker, the frontend and the web crawler write their logs, and the rules for adding a log line. How to read the logs of a running stack is in "Reading the logs" on [Troubleshooting](../self-hosting/troubleshooting.md#reading-the-logs).

## The line

Every service writes plain text, one event per line, in the same field order:

```text
2026-11-02T14:03:01.123Z INFO    ai_ta_backend.rabbitmq.rmqueue rid=5f3a9c1e0b2d job enqueued job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 queue=uiuc-chat
2026-11-02T14:03:09.410Z ERROR   ingest rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 _ingest_single_pdf failed for courses/ece120/lecture1.pdf at=ingest.py:1042
Traceback (most recent call last):
  ...
fitz.fitz.FileDataError: cannot open broken document
2026-11-02T14:03:09.471Z ERROR   ingest rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 done handler=_ingest_single_pdf file=courses/ece120/lecture1.pdf result=failed err=FileDataError: cannot open broken document ms=126 at=ingest.py:1981
```

1. The time in UTC, with milliseconds.
2. The level, padded to 7 characters.
3. The logger name: the Python module name, for example `ai_ta_backend.main`, `ingest` or `worker`. There is no service name; the container or the CloudWatch log group already gives it.
4. `rid=` (request id), `job=` (ingest job) and `course=` (project name), each only when it is known.
5. The message. It says what failed and why in plain words. The exception type and text are after a colon or in `err=`, or in the traceback that follows the line. Details go in `key=value` pairs such as `file=`, `status=` and `ms=`.
6. `at=<file>:<line>`, on the `WARNING`, `ERROR` and `CRITICAL` lines of the Python services. It names the line of our code behind the line. With a traceback, it is the deepest frame in our own code: the line that raised, or the line that called the library that raised. Without one, it is the line of the log call. Lines from libraries and captured Python warnings have no `at=`. The frontend writes `at=` on `ERROR` lines; see "Where an error comes from" below.

A newline inside the message is written as `\n`, so a value cannot fake a new log line. A traceback keeps its real newlines and follows on the next lines. In the Python services, a password in a connection URL (`://user:password@`) is written as `://***@`; the frontend and the crawler do not do this. There is no JSON format and no switch for one.

The format lives in `apps/backend/ai_ta_backend/rabbitmq/log_setup.py`. `main.py`, `bridge.py` and `worker.py` call its `configure_logging()` once at start, which also sets noisy libraries (`urllib3`, `botocore`, `pika`, `pdfminer`, `openai` and others) to `WARNING`. `apps/backend/gunicorn.conf.py` gives gunicorn's own lines the same format; only gunicorn's first "Starting gunicorn" line comes before that and looks different. The module sits in `rabbitmq/` because the worker image contains only that folder. Import it the way `rmqueue.py` imports its neighbours (`try: from ai_ta_backend.rabbitmq.log_setup import ...` / `except ModuleNotFoundError: from log_setup import ...`): a second import name would load a second copy, and the request id would go missing.

`configure_logging()` also sends Python `warnings` through logging under the name `py.warnings` at `WARNING`, so an unclosed socket or an unverified TLS request shows up in the log. The one exception is LangChain's `LangChainDeprecationWarning`, about 100 lines in every ingest child, which a filter on that logger drops by name. It also turns off the `transformers` library's advice lines, which bypass this format.

`LOG_LEVEL` sets the lowest level a service writes. The default is `INFO`, which is also what production runs. An unknown value falls back to `INFO` with one warning line.

## Levels

- **`DEBUG`**: detail for each item, and sizes of payloads. Off in production. For example one line per page or Canvas item, search timings, attempts 2 to 10 of a job that is re-queued.
- **`INFO`**: one line per unit of work (a request, a job, a file, a Canvas section) and for lifecycle events (started, connected, config loaded). For example `request method=POST route=/ingest status=200 ms=41`, `Worker connected to RabbitMQ queue=uiuc-chat`, `done handler=_ingest_single_pdf ... result=Success`.
- **`WARNING`**: something unexpected that the code handled: a retry, a fallback, an empty result where content was expected. For example `ingest attempt 1/3 failed`, `no handler for ext=.zip ... trying text fallback`, a Canvas section skipped.
- **`ERROR`**: this request or job failed. Logged once, where the failure is handled, with the cause. For example `done ... result=failed err=...`, `Canvas 401 for /api/v1/users/self: ...`.
- **`CRITICAL`**: the process cannot continue, for example a required variable missing at start.

## Rules

- Every module gets its own logger: `logger = logging.getLogger(__name__)`. No calls on the root logger (`logging.info(...)`), and no `print`: neither has a level, a time or the ids. Two scripts are the exception and name their logger: `worker.py` uses `logging.getLogger('worker')`, because the spawned ingest process imports it as `__mp_main__`, and `bridge.py` uses `logging.getLogger('bridge')`, because it runs as `python bridge.py` and its `__name__` is `__main__`.
- Pass values as arguments: `logger.info("queued %d jobs for course=%s", count, course)`, never an f-string.
- Inside an `except` block, use `logger.exception("<what failed> course=%s", course)`. It adds the traceback.
- Log an error once, at the layer that handles it. Lower layers raise or return the error; they do not log it as well.
- Never log API keys, tokens, passwords, secrets, cookies, full request bodies, full documents or prompts. Log names, lengths, counts and statuses instead. Email addresses and URLs are permitted, with one exception: a URL that carries one of our secrets. That is a connection string (`redis://user:password@host`, a Postgres URI), a presigned URL, or a URL with a key or a token in it. Do not put such a URL in a log line; log the host, the bucket or a name instead. The Node loggers do not look for these and do not hide them. The raw message of an error from a client of a database or of storage can hold such a URL: where the connection is one that a person configured (the external connection test), log the name and the code of the error, not its message.
- Cut text from other services to 500 characters before logging it: `response.text[:500]`.
- The request line keeps the key names `route=` and `ms=`; saved CloudWatch queries read them.
- Leave existing `sentry.capture_exception(e)` calls next to `logger.exception`. Sentry counts the two as one event.

## How the request id travels

One id follows an upload from the browser to the worker, so one search for `rid=<id>` across the containers shows the whole story.

1. The upload area in the browser makes an id for each file and sends it in the `X-Request-ID` header of the call to the Next.js API.
2. The Next.js API route reads that header, or makes an id, and forwards it to the backend.
3. Flask (`install_request_logging` in `log_setup.py`, used by `main.py` and `bridge.py`) takes the `X-Request-ID` header when it is 1 to 64 letters, digits, `-` or `_`, and otherwise makes a 12-character id. It writes one `INFO` request line per request (not for `/health`, `/api/healthcheck` and `OPTIONS` preflight requests) and sends the id back in the `X-Request-ID` response header.
4. `rmqueue.addJobToIngestQueue` puts the id into the queue message as `request_id`. A job that is re-queued keeps it.
5. The worker binds `rid`, `job` and `course` for the whole job. The spawned ingest process receives the id as an argument and binds it again, because the context does not cross into a new process.

Background tasks started from a request (Flask-Executor threads and the process pool) get the request's context when they are submitted, so their lines carry the same `rid=`. A background task that raises is logged once, as `background task <name> failed` with its traceback.

## Repeats and gaps that are expected

- When an ingest handler raises, one file gives two `ERROR` lines: the traceback from the handler's `except`, then the one-line summary `done handler=... result=failed err=... ms=...`. Every failed file gets that summary line, including handlers that fail without raising.
- The worker tries a failing file 3 times in the same job (`main_ingest`), so one failing file can give up to 3 `ERROR` blocks, with a `WARNING` for each failed attempt.
- A job that fails before ingest starts (the database lookup or the connection resolve) goes back on the queue. With the default `MAX_JOB_RETRIES=10` it gets 11 attempts: attempt 1 logs `ERROR` with the traceback (`job failed before ingest (DB or connection resolve), attempt 1/11`), attempts 2 to 10 log one `DEBUG` line each, and the last one logs `ERROR` with `discarded after 11 attempts`.
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
- Inside a route that checks project access, `course=` is already on every line, so there is no need to pass `course` in the fields. If you do, it is not written twice: the logger leaves out a field that has the same value as the context.

A line looks like this:

```text
2026-11-02T14:03:01.050Z INFO    api.ingest rid=5f3a9c1e0b2d path=/api/UIUC-api/ingest course=ece120 submitted to ingest queue file=courses/ece120/5f3a9c1e-0b2d-4c1a-9e2f-3b7d6a8c1f04-lecture1.pdf status=200 task_id=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17
2026-11-02T14:07:44.912Z ERROR   backendFetch rid=8c41d7a2e9f0 path=/api/UIUC-api/ingest course=ece120 backend 500 POST /ingest ms=812 body={"error":"..."} at=src/utils/server/backendFetch.ts:59
```

The fields are the same as in Python, with `path=` (the API route, without the query string) where Python has `job=`. An error follows on the next lines as `Name: message` and its stack frames. If the error has a `cause`, it follows as `Caused by: Name: message`. Newlines inside the message, the fields and the message of an error are written as `\n`, and the other control characters as `\x00` and so on, so text from a request or from another service cannot start a line that looks like a new event. When the error has a `code` (for example `ECONNREFUSED`), it follows the message as `(code=...)`. For an `AggregateError`, which `fetch` gives when a host has more than one address, the first 3 of its errors follow as `error 1 of 2: Name: message`. A chain of causes is followed for 5 errors. A thrown value that is not an `Error` is cut at 500 characters. The message of an error is cut at 4,000 characters and its code at 100. The logger does not throw: when a field or an error cannot be read, it writes the line without the details, and when nothing of the line can be read, it writes `a log line could not be written`.

**Where an error comes from.** Every `ERROR` line ends with `at=<file>:<line>`: the line in the app that called `log.error`. The logger adds it, so do not pass `at` in the fields. `DEBUG`, `INFO` and `WARNING` lines do not have it. When an error object is logged, its stack frames name the line that threw:

```text
2026-11-02T14:05:12.337Z ERROR   api rid=8c41d7a2e9f0 path=/api/UIUC-api/getSimWorkflows course=ece120 project metadata store unavailable at=src/utils/server/routeContext.ts:28
MetadataUnavailableError: could not read the metadata of project ece120
    at src/server/authorization.ts:51:11
    at src/server/authorization.ts:398:32
    at src/utils/server/routeContext.ts:54:7
    ...
Caused by: Error: connect ECONNREFUSED 172.18.0.5:6379
```

The file and line are those of the source file, in `npm run local` (`next dev --turbopack`) and in a production build. With `next dev --webpack` the line numbers are those of the transformed module and can be a few lines off. A production build is minified, so the logger reads the source maps that the build writes beside the server chunks (`experimental.serverSourceMaps` in `apps/frontend/next.config.mjs`) and rewrites each frame of the app as `at <file>:<line>:<column>`, without the function name. Frames of Node and of packages that are loaded from `node_modules` stay as they are; a package that the build put inside a chunk is rewritten too, as `at webpack://.../node_modules/<package>/...`. Without the source maps, the frames and `at=` point into `.next/server/chunks/` instead. The maps are for the server only; the browser cannot fetch them.

The maps cost disk and memory. They add about 40 MB to `.next/server`. A parsed map takes about 10 times its file size in memory, so the logger reads a map only when an error has a frame in that chunk, does not read a map file of more than 4 MB (those are the chunks of large packages; their frames stay as chunk positions), and keeps at most 8 MB of map files parsed, which is about 80 MB of memory in the worst case.

`log.debug`, `log.info`, `log.warn` and `log.error` write `DEBUG`, `INFO`, `WARNING` and `ERROR`. The level names mean the same as for Python (see "Levels" above). `LOG_LEVEL` sets the lowest level that is written; it is read on every call. A missing value means `INFO`. An unknown value also means `INFO`, and the logger writes one warning line (`unknown LOG_LEVEL=<value>, using INFO`). `CRITICAL` means errors only, because there is no `CRITICAL` writer. Every event is one `console` call with one string (`console.log` for `DEBUG` and `INFO`, `console.warn`, `console.error`), so a test can spy on `console.error`.

`log.ts` and `requestContext.ts` are meant for server code, but some of that code is also bundled for the browser. In the browser there is no request context, and a line is a timestamped `console` message without ids. For this to work, `requestContext.ts` imports `async_hooks` by its bare name, which `next.config.mjs` replaces with an empty module in the browser. Do not change it to `node:async_hooks`: that form cannot be replaced.

### Frontend: the request id

1. The upload area (`LargeDropzone.tsx`) makes one id per file: the first 12 hex characters of the uuid that also starts the file's S3 name. It sends the id in the `X-Request-ID` header of the calls to `/api/UIUC-api/uploadToS3` and `/api/UIUC-api/ingest`. It does not send it on the upload to the bucket itself: a custom header there makes the browser ask the bucket for CORS permission first, and the bucket refuses.
2. The route wrappers open the request context: `withAuth` (`src/utils/authMiddleware.ts`), `withAppRouterAuth` (`src/utils/appRouterAuth.ts`) and the two `withCourseAccessFromRequest` versions (`src/server/authorization.ts`, `src/app/api/authorization.ts`). They take the `X-Request-ID` header when it is 1 to 64 letters, digits, `-` or `_`, and otherwise make a 12-character id. The context holds `rid`, `path` and, once a project access check knows it, `course`. A wrapper writes an id it made back onto the request, and sends the id back in the `X-Request-ID` response header. A wrapper inside another one uses the context that is already open. The shared code is in `src/utils/server/routeContext.ts`. Routes with no auth wrapper (`chat-api/chat`, `chat-api/keys/validate`, `UIUC-api/getMaintenanceModeFast`, `UIUC-api/getMaintenanceModeDetails`, `UIUC-api/isSignedIn`, `UIUC-api/announcementBanner`, `UIUC-api/navbarBranding`, `UIUC-api/navbarLogo`, `healthcheck`) call `runPagesRoute` themselves. A new route must have one of the wrappers or call `runPagesRoute`, or it has no request id.
3. `backendFetch(url, init)` (`src/utils/server/backendFetch.ts`) is `fetch` for calls to the backend. It adds the `X-Request-ID` header and measures the time. When the backend answers with an error status, it writes one `ERROR` line `backend <status> <method> <path> ms=<n> body=<text>`, with the first 500 characters of the reply, and returns the response unchanged. A 422 is a `WARNING` line with the same text: the backend understood the request and found nothing it could do with it, for example a Canvas course with no document to import. A route that passes the status of the backend on to the browser uses `statusForBrowser(status)` from the same file. It turns a 401 or 403 into 502, because that is about the key or the network between our two services and the browser reads a 401 as "not signed in"; every other status stays as it is. These routes call the backend through `backendFetch`: the ingest path (`ingest.ts`, `ingestCanvas.ts`, `chat-file-upload.ts`, `deleteDocument.ts`), `getNomicMapForQueries.ts`, `createProject.ts`, `logConversation.ts`, `getAllCourseData.ts`, `downloadMITCourse.ts`, `downloadConvoHistoryUser.ts` and the stats routes (`getProjectStats.ts`, `getConversationStats.ts`, `getModelUsageCounts.ts`, `getWeeklyTrends.ts`). Three routes that call the backend with axios (`downloadConvoHistory.ts`, `exportAllDocuments.ts`, `getContextsMQR.ts`) send the id with `requestIdHeaders()`. A backend call with plain `fetch` does not forward the id.
4. `scrapeWeb.ts` sends the id to the crawler in the `X-Request-ID` header. The crawler sends it on with every page it passes to the backend's `/ingest`.

### Frontend: errors in API routes

The wrappers catch anything a route handler throws. The route then answers:

- **500** with `{"error": "Internal server error", "message": "The server hit an unexpected error."}`, and the log gets one `ERROR` line `unhandled error in API route` with the stack. A bug in a handler is no longer reported as a failed sign-in (401).
- **503** with `{"error": "Project metadata store unavailable", "message": "Project settings could not be loaded. Try again shortly."}` when the project settings cannot be read from Redis. The log gets one `ERROR` line `project metadata store unavailable`. Before, such a request answered 404 `Project not found`. See [Troubleshooting](../self-hosting/troubleshooting.md).

Both lines use the scope `api`. If the handler had already started its reply, the status cannot change, and the reply is closed.

**Errors in a streamed reply.** `streamText` of the AI SDK does not throw when the provider fails (a bad key, a 429, an unknown model). The error comes as a part of the stream, and the reply is an empty 200. Every `streamText` call passes `onError`, or reads the error part from `fullStream` (`openaiCompatible.ts`), and writes one `ERROR` line `LLM stream failed` with the stack, and with `model=<id>` where the call site has the model. The streams that the app builds by hand (`ollama.ts`, `vllm.ts`, `utils/server/index.ts`) write the same line when the provider fails after the reply has started. They do not write it when the reader went away (the user stopped the reply or left the page): `isClosedStreamError` in `src/utils/server/streamErrors.ts` tells the two apart. A new stream must do the same.

`onError` is not called when the connection to the provider breaks in the middle of a reply: then the read of the reply fails. `logStreamFailure(response, log, fields)` in the same file wraps a reply and writes the `LLM stream failed` line for that case, with the request id of the request that started the reply. On that line, `at=` names the wrapper; the scope (`llm.bedrock`, `api.chat.vlm`) names the provider. Every reply that comes straight from `streamText` goes through it. The Anthropic reply with reasoning in `app/utils/anthropic.ts` reads its stream itself and writes the line there.

Log one `ERROR` per failure. The code that handles the failure (usually the route, or the wrapper's catch-all) writes the `ERROR` with the stack. An inner step that catches an error and throws it on writes at most a `WARNING` with the step's name and no stack. For example, when the backend refuses an ingest, `backendFetch` writes the `ERROR` with the status and the reply, and the ingest route adds only a `WARNING` `ingest not queued`.

### Frontend: where `console` is still used

ESLint warns about `console` (`no-console`) in `src/pages/api/`, `src/app/api/`, `src/server/`, `src/app/utils/` and `src/utils/server/`, but not in tests. `log.ts` turns the rule off for itself, because it is the one place that writes to the console. The other server-only files in `src/utils/` (`authMiddleware.ts`, `appRouterAuth.ts`, `redisClient.ts`) are not covered by the rule; use the logger there too. `redisClient.ts` keeps its one `Redis client error:` line, written once per process.

Four shared files keep `console`: `src/utils/streamProcessing.ts`, `src/utils/functionCalling/handleFunctionCalling.ts`, `src/utils/fetchContexts.ts` and `src/utils/apiUtils.ts`. Their code runs in the browser most of the time, where the logger has no request id to add. ESLint reports no `no-console` warning in the covered directories. The rule is a warning, not an error, so it does not stop a new `console` call; look for it in review.

### Crawler

The crawler (`apps/crawlee`) uses crawlee's own logger (`import { log } from 'crawlee'`). `apps/crawlee/src/logSetup.ts` sets it up; `main.ts` must import it first, so that lines written while other modules load are formatted too. A line looks like this:

```text
2026-11-03 00:16:29.261 INFO  rid=3c9e51b07a24 course=ece120: crawl started url=https://ece.illinois.edu/ strategy=same-hostname maxPages=50
2026-11-03 00:16:41.907 WARN  rid=3c9e51b07a24 course=ece120: Page failed after all retries url=https://ece.illinois.edu/old-page: Error: ...
2026-11-03 00:16:42.118 ERROR rid=3c9e51b07a24 course=ece120: Ingest request failed url=https://ece.illinois.edu/about status=500 body={"error":"..."} at=src/api/crawlee.ts:121
```

It differs from the other services:

- The time is UTC too, but has a space instead of `T` and no `Z`.
- The level names are short (`DEBUG`, `INFO`, `WARN`, `ERROR`) and padded to 5 characters.
- There is no logger name. Each crawl gets a child logger whose prefix is `rid=<id> course=<name>`; the prefix ends with `:`.

`POST /crawl` takes the `X-Request-ID` header under the same rule as the other services, or makes a 12-character id, and sends the id back in the `X-Request-ID` response header. It writes one `INFO` line when a crawl starts (`crawl started`) and one line when it ends (`crawl done result=<name> status=<n> pages_loaded=<n> ... ms=<n>`). The table below gives the level and the status of that line. A crawl that throws gives one `ERROR` line `crawl failed ms=<n>` with the stack (for invalid parameters, only the message), and a 500 reply with `error`, `errorTitle` and `errorMessage`; `scrapeWeb.ts` shows `errorMessage` to the user. A page that still fails after its retries gives a `WARN` line (`Page failed after all retries`). Before it, crawlee itself writes a `WARN` line `Reclaiming failed request back to the list or queue.` for each retry and one `ERROR` line `Request failed and reached maximum retries.`, with a stack, for the page; crawlee always writes these. A page the backend's `/ingest` refuses gives an `ERROR` with the URL, the status and the first 500 characters of the reply. Lines for each page are `DEBUG`. Values from requests and web pages are kept on one line (`oneLine()` in `logSetup.ts`).

**What `/crawl` answers.** A crawl is a success only when the backend's `/ingest` accepted at least one document. Before, `/crawl` answered 200 whenever the crawler did not throw, also when every page failed. The rules are in `apps/crawlee/src/crawlOutcome.ts`:

| What the crawl did | `result=` | Status | Level |
|---|---|---|---|
| At least one page or PDF was accepted, nothing failed | `ok` | 200 | `INFO` |
| At least one was accepted, and some pages or PDFs failed | `partial` | 200 | `WARN` |
| No page could be loaded (no connection, timeout, bad host) | `NoPageLoaded` | 502 | `ERROR` |
| Pages were read, but `/ingest` refused each one, or each PDF failed | `IngestRefused` | 502 | `ERROR` |
| Each page was empty or an error page, or there was no page (an empty sitemap) | `NothingToIngest` | 422 | `WARN` |
| `NO_CRAWL=true` | `CrawlDisabled` | 503 | `WARN` |
| `INGEST_URL` is not set, invalid parameters, or the crawler throws | (line `crawl failed`) | 500 | `ERROR` |

The `crawl done` line has the same fields in each case: `pages_loaded`, `pages_failed`, `pages_skipped`, `pages_ingested`, `pages_refused`, `pdfs_found`, `pdfs_ingested`, `pdfs_skipped`, `pdfs_failed`. To find the crawls that gave no documents, search for `crawl done` with a `result=` that is not `ok` or `partial`. A reply that is not 200 has `error`, `errorTitle` (the `result` name) and `errorMessage`, with the first error of the crawl, and the counts. A 200 reply is an object with `message` and the counts; before, it was a string.

`/crawl` answers after each ingest request and each PDF of the crawl has an answer, so the counts are final and no line of a crawl comes after its `crawl done` line. An ingest request that gets no answer in 60 seconds counts as refused. A page counts as loaded when its handler ends, so a page that is tried again is counted once. A page is also sent to ingest one time at most: when an earlier try sent it, the try that comes after only reads its links, and writes one `DEBUG` line. A skip is not final: when the first try skipped a page that was not ready and a later try reads its content, the page is sent, and it is then not in `pages_skipped`. The `SKIP-INGEST` line of the first try stays in the log, and an `INFO` line `Page that an earlier try skipped has content now and is sent to ingest` says that it no longer holds. A PDF that many pages link to is handled once for each crawl.

The download of a PDF has a limit of 120 seconds for the whole download and a limit of 100 MB (`apps/crawlee/src/pdfDownload.ts`). A PDF that hits a limit fails, with one `ERROR` line that names the limit: `PDF download failed url=<url>: hit the time limit of 120 s`, or `hit the size limit of 100 MB`. Each try of a call to S3 fails when it gets no connection in 10 seconds, or when no data moves for 60 seconds. The S3 client makes 3 tries, so each call also has one limit of 10 minutes for all its tries together; a call that hits it fails with `the S3 call hit the time limit of 600 s`. Without these limits, one server that never ends its reply kept `/crawl` open with no end.

`logSetup.ts` turns crawlee's text logger into a `CrawlerLogger`, a small subclass. It changes the root logger object in place, because crawlee makes some loggers when it is imported (`BrowserPool`, `Request`, the Playwright utilities), and each of them keeps a reference to that object. So the changes apply to every line, also the lines that crawlee and Playwright write themselves:

- **Where an error comes from.** An `ERROR` line ends with `at=<file>:<line>`, the line of the crawler code that called `log.error` or `log.exception`, for example `at=src/main.ts:82`. A line that crawlee writes itself has no `at=`, because no line of the app logged it. For an error that nothing caught, `at=` is the line of the handler in `logSetup.ts`; the stack below it says where the error started. The image starts the crawler with `node --enable-source-maps` (`start:prod` in `package.json`), so `at=` and the stack frames name the TypeScript file in `src/`. Without that flag they name the built file in `dist/`.
- **One event, one line, then its stack.** Newlines and the other control characters (NUL, ESC, the Unicode line separators and direction marks) in a message or in the message of an error are written as `\n`, `\x00` and so on. The Docker image has colours off (`FORCE_COLOR=0`), and then every escape sequence is written out. With colours on, only the colour codes of the logger stay as they are. Playwright puts a "Call log" of several lines in its error messages; it stays on the line of its event. After the first line of an event, every line starts with a space: it is the message of the error, a stack frame or a `CAUSE:` line. Text from a request or a web page cannot start a line that looks like a new event.
- **URLs.** The crawler prints the URLs that it works on: the crawl URL and the URL of each page and PDF. A crawl log is of no use without them. The logger does not look for a login in a URL, so a URL of the form `https://user:password@site` shows as it is.
- **Length.** A message of more than 10,000 characters is cut, with a note of how many characters were left out. A stack is cut at 5,000 characters, and the stack of a cause at 2,500. The loggers that crawlee makes when it is imported keep its own limit of 500 characters for a stack.
- **The request id on every line of a crawl.** `main.ts` runs each crawl inside `crawlContext.run(...)`. Lines from crawlee loggers that do not come from the logger of the crawl (`RequestQueue`, `BrowserPool`, `Request`, the Playwright utilities) get the `rid=<id> course=<name>` of that crawl in front of their own prefix. The project name is cut at 200 characters, and every character in it that is not an ASCII letter, a digit or one of `. _ ~ -` is written as `%XX`, so the name cannot add a fake field. A usual project name stays as it is; a name with a space reads `my%20project` here and `my project` in the frontend lines.

Output that used to bypass the logger and now goes through it:

- A request that fails before the `/crawl` handler runs gives one `WARN` line `request refused method=<m> path=<p> status=<n>: <reason>` with the request id, and a JSON reply with `error`, `errorTitle` and `errorMessage`. For a body that is not valid JSON, the reason is the fixed text `the body is not valid JSON`: the parser's own message quotes a piece of the body. A body with no `params` object gets the same `WARN` line and a 400; before, it was a 500 with a stack. A failure with a 5xx status gives an `ERROR` line `request failed ...` with the stack. Before, express printed the stack with no timestamp and answered with an HTML page.
- An error that nothing caught gives one `ERROR` line `uncaught exception, the crawler stops` or `unhandled promise rejection, the crawler stops`, with the stack. The process then exits with code 1, as it did before, and the container starts again. The exit waits until the line is written, for 2 seconds at most.
- A Node process warning (for example the one for `NODE_TLS_REJECT_UNAUTHORIZED`) gives a `WARN` line with the warning's name and code. With `--trace-warnings` the stack of the warning follows.
- An S3 check that fails for a reason other than "not found" gives a line `Could not check S3 for an earlier copy`: `WARN`, or `DEBUG` for a 403, because S3 answers 403 for a new file when the role cannot list the bucket. Before, it gave no line.
- A value of the request body that cannot be turned into text (`{"toString": 1}`) is written as `[a value that cannot be written]`. Before, it stopped the crawler.

Every request gets a request id, not only `POST /crawl`: the id is made first, before the CORS reply to `OPTIONS` and before the body is read, and it is sent back in the `X-Request-ID` header of every reply. A request for a path that does not exist gets express's own 404 reply and no log line.

Some lines still have no timestamp, because they are written before the logger exists or by other programs: the lines of `npm` and of `start_xvfb_and_run_cmd.sh` when the container starts, and a notice that a dependency prints while it loads (`[baseline-browser-mapping] ...`).

The tests for the logger are in `apps/crawlee/src/logSetup.test.ts`. Run them with `npm test` in `apps/crawlee`. The `crawlee-tests` job of `.github/workflows/pr-checks.yml` runs the type check (`npm run build`) and all the crawler tests on each pull request.

`logSetup.ts` maps `LOG_LEVEL` to crawlee's own level setting (`APIFY_LOG_LEVEL`). An unknown value falls back to `INFO` with one warning line. In Compose the crawler gets `LOG_LEVEL` from `.env` through `env_file`, not from its `environment:` list like the other services. On the dev stack, put it in `apps/crawlee/.env`. The Docker image sets `FORCE_COLOR=0`, so the container output has no colour codes.

In CloudWatch, the crawler is the one service that must not get the `awslogs-datetime-format` option (`%Y-%m-%dT%H:%M:%S`). Its lines have a space where that format expects `T`, so no line would match, and the whole output would be joined into one event.
