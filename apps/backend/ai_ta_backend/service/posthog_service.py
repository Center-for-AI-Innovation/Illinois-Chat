import os

from injector import inject
from posthog import Posthog


class PosthogService:

  @inject
  def __init__(self):
    # PostHog is opt-in: without POSTHOG_HOST no events are sent anywhere.
    host = os.getenv("POSTHOG_HOST")
    self.posthog = Posthog(
        sync_mode=False,
        project_api_key=os.environ["POSTHOG_API_KEY"],
        host=host,
    ) if host else None

  def capture(self, event_name, properties):
    if self.posthog is None:
      return
    self.posthog.capture("distinct_id_of_the_user", event=event_name, properties=properties)