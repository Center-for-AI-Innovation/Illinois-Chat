"""Guards for server-side secrets that must only be sent to env-configured
hosts, never to a URL a project admin supplied.

The implementation lives in ai_ta_backend/rabbitmq/trusted_hosts.py because the
standalone worker image only ships the rabbitmq/ directory. Re-exported here so
the Flask app and the worker share one copy."""

from ai_ta_backend.rabbitmq.trusted_hosts import is_same_origin_as_any

__all__ = ["is_same_origin_as_any"]
