import os
import pprint
import smtplib
from typing import List

from ai_ta_backend.types.types import ClerkUser
from dotenv import load_dotenv
import pydantic
import requests
from retry import retry

load_dotenv(override=True)


def get_all_users_from_clerk() -> List[ClerkUser]:
  """
  Use the Clerk API to get all users. Returns typed variable.
  """
  done = False
  all_users = []
  offset = 0
  limit = 100

  # Get all users from Clerk
  headers = {'Authorization': f'Bearer {os.environ["CLERK_BEARER_TOKEN"]}'}
  while not done:
    users = requests.get(f"https://api.clerk.com/v1/users?limit={limit}&offset={offset}&order_by=-created_at", headers=headers, timeout=12)
    all_users.extend(users.json())
    if len(users.json()) == 0:
      done = True
    offset = offset + limit

  # Parse users into typed objects
  clerkUsers = []
  for u in all_users:
    # pprint.pprint(u)
    try:
      clerkUsers.append(ClerkUser(**u))
    except pydantic.error_wrappers.ValidationError as e:
      pprint.pprint(u)
      print("Error parsing above user into Pydantic types:", e)

  return clerkUsers


def send_html_email(subject: str, html_text: str, sender: str, receipients: list | None = None):
  """
  If receipients is empty, send to all users (unless they've unsubscribed from newsletter).
  If recipients is supplied, send to ONLY the receipients.

  Note account limits:
    * Maximum send rate: 14 emails per second
    * Daily sending quota: 50,000 emails per 24-hour period
  """
  # Unsubscribe list must come from SQL once EmailNewsletter exists.
  # Fail before Clerk sweeps / PII file writes — an empty stub would mail opt-outs.
  raise NotImplementedError("Newsletter send blocked: EmailNewsletter unsubscribe list is not "
                            "implemented yet. Refusing to send without opt-out filtering.")


# start with 1 second delay, increment by 1 at a time. Max tries of 65 (> 1 minute)
@retry(exceptions=Exception, tries=65, delay=1, max_delay=None, backoff=1, jitter=0)
def send_email_safely(sender, recipients: str, message):
  """
  Send an email using the AWS SES service. Retry if there is an exception.
  Note account limits:
    * Maximum send rate: 14 emails per second
    * Daily sending quota: 50,000 emails per 24-hour period
  """
  print("receipient in safe-send", recipients)

  with smtplib.SMTP_SSL(os.getenv('SES_HOST'), os.getenv('SES_PORT')) as server:  # type: ignore
    server.login(os.getenv('USERNAME_SMTP'), os.getenv('PASSWORD_SMTP'))  # type: ignore
    server.sendmail(sender, recipients, message.as_string())

    # log successful sends
    with open("successful_sends.txt", "a") as file:
      file.write(recipients + "\n")


if __name__ == "__main__":

  # Test with: python -m ai_ta_backend.utils.send_newsletter_email

  with open("ai_ta_backend/utils/email/product-update-1-minified.html", "r", encoding="utf-8") as file:
    html_content = file.read()

    success_or_fail = send_html_email(
        subject="UIUC.chat Product Update 1",
        html_text=html_content,
        sender="rohan13@illinois.edu",
    )
    # receipients=["rohan13@illinois.edu"])
    print("success_or_fail:", success_or_fail)
