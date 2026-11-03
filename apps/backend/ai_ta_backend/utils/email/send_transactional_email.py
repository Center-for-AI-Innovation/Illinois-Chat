import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

# SES_PORT is optional: unset or empty means smtplib's default SSL port, 465.
_SMTP_VARS = ('SES_HOST', 'USERNAME_SMTP', 'PASSWORD_SMTP')


def send_email(subject: str, body_text: str, sender: str, recipients: list, bcc_recipients: list):
  """
    Send an email using the AWS SES service
    :param subject: The subject of the email
    :param body_text: The body of the email
    :param sender: The email address of the sender
    :param recipients: A list of email addresses to send the email to
    :param bcc_recipients: A list of email addresses to send the email to as BCC
    :return: A string indicating the result of the email send operation

    """
  # Create message content
  message = MIMEMultipart("alternative")
  message["Subject"] = subject
  message["From"] = sender
  message["To"] = ", ".join(recipients)

  if len(bcc_recipients) > 0:
    message["Bcc"] = ", ".join(bcc_recipients)

  # Add plain text part
  part1 = MIMEText(body_text, "plain")
  message.attach(part1)

  # Add additional parts for HTML, attachments, etc. (optional)

  # Raise one error that names the missing setting or the host; the caller
  # that handles it logs it. Never put recipients or credentials in it.
  for name in _SMTP_VARS:
    if not os.getenv(name):
      raise RuntimeError(f"SMTP not configured: {name} is unset")

  # Connect to SMTP server
  try:
    server = smtplib.SMTP_SSL(os.getenv('SES_HOST'), os.getenv('SES_PORT') or None)  # type: ignore
  except OSError as e:
    raise RuntimeError(f"SMTP unreachable at {os.getenv('SES_HOST')}: {e}") from e
  with server:
    server.login(os.getenv('USERNAME_SMTP'), os.getenv('PASSWORD_SMTP'))  # type: ignore
    server.sendmail(sender, recipients + bcc_recipients, message.as_string())

  logger.debug("email sent recipients=%d bcc=%d", len(recipients), len(bcc_recipients))
  return "Email sent successfully!"
