# Logging

How the backend, the ingest bridge and the ingest worker write their logs, and the rules for adding a log line. How to read the logs of a running stack is in "Reading the logs" on [Troubleshooting](../self-hosting/troubleshooting.md#reading-the-logs).

## The line

Every service writes plain text, one event per line, in the same field order:

```text
2026-11-02T14:03:01.123Z INFO    ai_ta_backend.rabbitmq.rmqueue rid=5f3a9c1e0b2d job enqueued job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 queue=uiuc-chat
2026-11-02T14:03:09.410Z ERROR   ingest rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 _ingest_single_pdf failed for courses/ece120/lecture1.pdf
Traceback (most recent call last):
  ...
fitz.fitz.FileDataError: cannot open broken document
2026-11-02T14:03:09.471Z ERROR   ingest rid=5f3a9c1e0b2d job=7b0c2e64-91d3-4f0e-a6c8-2d5e1b9f4a17 course=ece120 done handler=_ingest_single_pdf file=courses/ece120/lecture1.pdf result=failed err=FileDataError: cannot open broken document ms=126
```

1. The time in UTC, with milliseconds.
2. The level, padded to 7 characters.
3. The logger name: the Python module name, for example `ai_ta_backend.main`, `ingest` or `worker`. There is no service name; the container or the CloudWatch log group already gives it.
4. `rid=` (request id), `job=` (ingest job) and `course=` (project name), each only when it is known.
5. The message. It says what failed and why in plain words, with the exception type and text after a colon. Details go in `key=value` pairs such as `file=`, `status=` and `ms=`.

A newline inside the message is written as `\n`, so a value cannot fake a new log line. A traceback keeps its real newlines and follows on the next lines. A password in a connection URL (`://user:password@`) is written as `://***@`. There is no JSON format and no switch for one.

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
- Never log tokens, passwords, cookies, connection URLs with credentials, full request bodies, full documents, prompts or email addresses. Log names, lengths, counts and statuses instead.
- Cut text from other services to 500 characters before logging it: `response.text[:500]`.
- The request line keeps the key names `route=` and `ms=`; saved CloudWatch queries read them.
- Leave existing `sentry.capture_exception(e)` calls next to `logger.exception`. Sentry counts the two as one event.

## How the request id travels

One id follows an upload from the browser to the worker, so one search for `rid=<id>` across the containers shows the whole story.

1. The browser makes an id with `newRequestId()` from `apps/frontend/src/utils/requestId.ts` (12 hex characters, the backend's shape) and sends it in the `X-Request-ID` header of the call to the Next.js API route. The upload area (`LargeDropzone`) makes one id per file; the Canvas form, the web scrape form and the chat file upload make one per request.
2. The Next.js API routes that start an upload (`ingest.ts`, `ingestCanvas.ts` and `chat-file-upload.ts` under `pages/api/UIUC-api/`) call `requestIdFromHeaders(req.headers)`, which keeps the browser's id when it is valid and otherwise makes one. The route forwards it to the backend in `X-Request-ID`, writes `rid=` in its own console lines and returns it in the `X-Request-ID` response header. The other Next.js routes that call the backend (stats, exports, delete) do not forward an id yet; the backend makes one for them.
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

PR 2 of the logging work adds the crawler details here, and the `rid=` for the rest of the Next.js routes.
