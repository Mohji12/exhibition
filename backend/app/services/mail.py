from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


def mail_configured() -> bool:
    if not settings.mail_enabled:
        return False
    if settings.mail_smtp_host.strip() and settings.mail_smtp_password.strip():
        return True
    return bool(settings.resend_api_key.strip())


def send_pin_email(to_email: str, name: str, pin: str) -> tuple[bool, str]:
    """Send a login PIN email via SMTP (ZeptoMail) or Resend fallback."""
    if not mail_configured():
        return False, "Email is not configured yet"

    subject = "Your FUNNEL login PIN"
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Your FUNNEL booth login PIN is <strong>{pin}</strong>.</p>"
        f"<p>Sign in at https://www.conninter.com</p>"
        f"<p>— Conninter</p>"
    )
    text = (
        f"Hi {name},\n\n"
        f"Your FUNNEL booth login PIN is {pin}.\n"
        f"Sign in at https://www.conninter.com\n\n"
        f"— Conninter\n"
    )

    if settings.mail_smtp_host.strip() and settings.mail_smtp_password.strip():
        return _send_smtp(to_email, subject, text, html)

    return _send_resend(to_email, subject, html)


def _send_smtp(to_email: str, subject: str, text: str, html: str) -> tuple[bool, str]:
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.mail_from.strip()
        msg["To"] = to_email
        msg.set_content(text)
        msg.add_alternative(html, subtype="html")

        host = settings.mail_smtp_host.strip()
        port = int(settings.mail_smtp_port)
        user = settings.mail_smtp_user.strip() or "emailapikey"
        password = settings.mail_smtp_password.strip()
        timeout = 25

        if port == 465 or settings.mail_smtp_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=timeout) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as smtp:
                smtp.ehlo()
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
                smtp.login(user, password)
                smtp.send_message(msg)
        return True, "Email sent"
    except Exception:
        logger.warning("PIN email SMTP send failed", exc_info=True)
        return False, "Could not send email"


def _send_resend(to_email: str, subject: str, html: str) -> tuple[bool, str]:
    try:
        import json
        import urllib.request

        payload = json.dumps(
            {
                "from": settings.mail_from,
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key.strip()}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            if 200 <= resp.status < 300:
                return True, "Email sent"
            return False, "Could not send email"
    except Exception:
        logger.warning("PIN email Resend send failed", exc_info=True)
        return False, "Could not send email"
