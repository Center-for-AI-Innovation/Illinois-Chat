# Gunicorn reads ./gunicorn.conf.py by default, so run.sh and the Dockerfile CMDs need no flag.
# Give gunicorn's own lines (boot, worker timeouts) the same UTC timestamp format as the app.


def on_starting(server):
    from ai_ta_backend.rabbitmq.log_setup import LineFormatter  # pylint: disable=import-outside-toplevel
    for handler in server.log.error_log.handlers:
        handler.setFormatter(LineFormatter())
