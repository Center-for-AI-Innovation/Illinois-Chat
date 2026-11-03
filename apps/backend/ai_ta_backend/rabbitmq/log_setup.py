"""Shared logging setup for the backend API, the ingest bridge and the worker.

Every line has the same shape:

        2026-11-02T14:03:01.123Z INFO    ai_ta_backend.main rid=5f3a9c1e job=7b0c course=ece120 message

The time is UTC. `rid=`, `job=` and `course=` appear only when they are known
(see `bind`). A traceback follows on the next lines.

This module lives in rabbitmq/ because the worker image only contains that
folder. Import it with the same pattern everywhere, or the context below is
created twice and `current_rid()` returns None in the other copy:

        try:
                from ai_ta_backend.rabbitmq.log_setup import configure_logging
        except ModuleNotFoundError:
                from log_setup import configure_logging
"""
import contextvars
import logging
import os
import re
import sys
import time
import uuid

logger = logging.getLogger(__name__)

# Libraries that are too chatty below WARNING.
LIBRARY_LOGGERS = (
        'urllib3', 'botocore', 'boto3', 's3transfer', 'pika', 'sqlalchemy.engine', 'httpx', 'httpcore',
        'pdfminer', 'PIL', 'werkzeug', 'posthog', 'openai', 'canvasapi',
)

_CONTEXT_KEYS = ('rid', 'job', 'course')
_context: contextvars.ContextVar = contextvars.ContextVar('log_context', default=None)

# Hide the password in a URL such as amqp://user:secret@host.
_PASSWORD_IN_URL = re.compile(r'://[^/@\s]+:[^/@\s]+@')
_REQUEST_ID = re.compile(r'[A-Za-z0-9_-]{1,64}')

_PLAIN_FORMAT = '%(asctime)s.%(msecs)03dZ %(levelname)-7s %(name)s %(message)s'
_DATE_FORMAT = '%Y-%m-%dT%H:%M:%S'


# ---------------------------------------------------------------------------
# Log context (request id, job id, course)
# ---------------------------------------------------------------------------

def current_context() -> dict:
    """A copy of the fields bound in this thread or task."""
    return dict(_context.get() or {})


def current_rid():
    """The request id bound in this thread or task, or None."""
    return (_context.get() or {}).get('rid')


def bind(**fields) -> None:
    """Add fields to the log context. A None value removes the field."""
    ctx = current_context()
    for key, value in fields.items():
        if value is None:
            ctx.pop(key, None)
        else:
            ctx[key] = value
    _context.set(ctx)


def clear() -> None:
    """Drop all fields. Sets a new value instead of resetting a token, because
    Flask-Executor runs the request teardown in a pool thread."""
    _context.set({})


def new_request_id(incoming=None) -> str:
    """Use the caller's id when it is safe to log, else make a new one."""
    if isinstance(incoming, str) and _REQUEST_ID.fullmatch(incoming):
        return incoming
    return uuid.uuid4().hex[:12]


def _render_context() -> str:
    ctx = _context.get() or {}
    parts = []
    for key in _CONTEXT_KEYS:
        value = ctx.get(key)
        if isinstance(value, (list, tuple)):
            value = value[0] if value else None
        if value is None or value == '':
            continue
        parts.append('%s=%s ' % (key, _one_line(str(value))))
    return ''.join(parts)


def _one_line(text: str) -> str:
    return text.replace('\r', '\\r').replace('\n', '\\n')


# ---------------------------------------------------------------------------
# Formatter and setup
# ---------------------------------------------------------------------------

class LineFormatter(logging.Formatter):
    """One line per record: UTC time, level, logger name, context, message.

    Newlines in the message are escaped so a value cannot fake a second log line.
    The traceback keeps its real newlines.
    """

    converter = time.gmtime

    def __init__(self):
        super().__init__(fmt=_PLAIN_FORMAT, datefmt=_DATE_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        try:
            message = _PASSWORD_IN_URL.sub('://***@', _one_line(record.getMessage()))
            line = '%s.%03dZ %-7s %s %s%s' % (self.formatTime(record, self.datefmt), record.msecs,
                                              record.levelname, record.name, _render_context(), message)
            if record.exc_info and not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            if record.exc_text:
                line += '\n' + _PASSWORD_IN_URL.sub('://***@', record.exc_text)
            if record.stack_info:
                line += '\n' + self.formatStack(record.stack_info)
            return line
        except Exception:  # pylint: disable=broad-except
            # Never lose a record because of the extras above.
            return super().format(record)


def configure_logging() -> int:
    """Send all logs to stderr in the shared line format. Safe to call twice.

    LOG_LEVEL picks the level (default INFO). An unknown name falls back to INFO.
    """
    raw = os.getenv('LOG_LEVEL', 'INFO')
    level = logging.getLevelName(raw.strip().upper() or 'INFO')
    unknown = not isinstance(level, int)
    if unknown:
        level = logging.INFO

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(LineFormatter())
    # force=True replaces any handler an earlier import installed.
    logging.basicConfig(level=level, handlers=[handler], force=True)
    for name in LIBRARY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
    # Send warnings.warn() through logging so they get the format and the ids.
    # LangChain forces its ~100 LangChainDeprecationWarning lines past any
    # warnings filter (it sets "always" around each warn), so drop those by
    # name and keep every other warning (RuntimeWarning, ResourceWarning,
    # urllib3's InsecureRequestWarning ...) at WARNING.
    logging.captureWarnings(True)
    py_warnings = logging.getLogger('py.warnings')
    py_warnings.setLevel(logging.WARNING)
    py_warnings.addFilter(_drop_langchain_deprecations)
    # transformers writes its advice ("None of PyTorch, TensorFlow ... found") through its own
    # handler, without our time stamp. We use no models, so turn that advice off.
    os.environ.setdefault('TRANSFORMERS_NO_ADVISORY_WARNINGS', '1')

    if unknown:
        logger.warning('unknown LOG_LEVEL=%s, using INFO', raw)
    return level


# ---------------------------------------------------------------------------
# Flask request logging
# ---------------------------------------------------------------------------

_SKIP_PATHS = ('/health', '/api/healthcheck')


def _drop_langchain_deprecations(record) -> bool:
    """Logging filter: False for a captured LangChainDeprecationWarning, True for any other warning."""
    return 'LangChainDeprecationWarning' not in record.getMessage()


def install_request_logging(app, logger_name=None) -> None:
    """Bind a request id per request, log one line per request, return the id
    in the X-Request-ID response header.

    The request line is written under `logger_name`, default the Flask app's name
    (`__main__` for a script run as `python bridge.py`, so the bridge passes its own)."""
    from flask import g, request  # pylint: disable=import-outside-toplevel

    request_logger = logging.getLogger(logger_name or app.name)

    @app.before_request
    def _start_request_log():
        clear()
        bind(rid=new_request_id(request.headers.get('X-Request-ID')))
        g.log_start = time.monotonic()

    @app.after_request
    def _end_request_log(response):
        rid = current_rid()
        if rid:
            response.headers['X-Request-ID'] = rid
        # Skip health checks and CORS preflights: they say nothing about the work.
        if request.path not in _SKIP_PATHS and request.method != 'OPTIONS':
            start = g.get('log_start')
            ms = int((time.monotonic() - start) * 1000) if start is not None else -1
            request_logger.info('request method=%s route=%s status=%d ms=%d', request.method, request.path,
                                response.status_code, ms)
        return response

    @app.teardown_request
    def _clear_request_log(_exc=None):
        clear()


# ---------------------------------------------------------------------------
# Background tasks
# ---------------------------------------------------------------------------

def run_with_context(ctx, name, fn, /, *args, log_failure=True, **kwargs):
    """Run fn in a pool thread or process with the submitter's log context.

    ctx, name and fn are positional-only so that fn's own keyword arguments
    (for example a `name=`) are passed through instead of clashing with them.
    log_failure=False leaves the failure line to the caller (the process pool
    logs it once in the parent, see process_pool_executor.py)."""
    _context.set(dict(ctx or {}))
    try:
        return fn(*args, **kwargs)
    except Exception:
        if log_failure:
            logger.exception('background task %s failed', name)
        raise
    finally:
        clear()
