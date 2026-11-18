import logging
import os

from injector import inject
from posthog import Posthog

logger = logging.getLogger(__name__)
_unset_logged = False  # a failed singleton is rebuilt on every request; log the cause once


class PosthogService:

  @inject
  def __init__(self):
    # PostHog is opt-in: without POSTHOG_HOST no events are sent anywhere.
    host = os.getenv("POSTHOG_HOST")
    global _unset_logged
    if host and not os.environ.get("POSTHOG_API_KEY") and not _unset_logged:
      _unset_logged = True
      logger.error("PostHog not configured: POSTHOG_HOST is set but POSTHOG_API_KEY is unset")
    self.posthog = Posthog(
        sync_mode=False,
        project_api_key=os.environ["POSTHOG_API_KEY"],
        host=host,
    ) if host else None

  def capture(self, event_name, properties):
    if self.posthog is None:
      return
    self.posthog.capture("distinct_id_of_the_user", event=event_name, properties=properties)
