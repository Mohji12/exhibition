from __future__ import annotations

import html as html_lib
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)

APP_URL = "https://www.conninter.com"


def mail_configured() -> bool:
    if not settings.mail_enabled:
        return False
    if settings.mail_smtp_host.strip() and settings.mail_smtp_password.strip():
        return True
    return bool(settings.resend_api_key.strip())


def send_pin_email(to_email: str, name: str, pin: str) -> tuple[bool, str]:
    """Welcome note with how to use FUNNEL, plus login PIN for backup."""
    if not mail_configured():
        return False, "Email is not configured yet"

    safe_name = html_lib.escape((name or "there").strip() or "there")
    safe_pin = html_lib.escape(str(pin).strip())
    subject = "Welcome to FUNNEL — your login PIN & how to get started"

    text = (
        f"Hi {name},\n\n"
        f"Welcome to FUNNEL by Conninter — booth lead capture for exhibitions.\n\n"
        f"Your login PIN (keep this for your records): {pin}\n\n"
        f"Sign in\n"
        f"1. Open {APP_URL}\n"
        f"2. Enter the email on this account and your 4-digit PIN\n"
        f"3. You are in — capture leads at the booth\n\n"
        f"How to use FUNNEL\n"
        f"• New lead — fill in visitor details, company, and interests\n"
        f"• Business card — photograph a card; FUNNEL can help fill the fields\n"
        f"• Voice note — record a short booth note; it saves even if the network is slow\n"
        f"• Offline — keep capturing; leads sync when you are back online\n"
        f"• Follow-ups — add appointment notes when a visitor wants a callback\n"
        f"• Share link — use your public form / QR so visitors can self-register\n\n"
        f"Tips\n"
        f"• Save this email so you always have your PIN\n"
        f"• Do not share your PIN with other booths\n"
        f"• If you forget it, use Forgot PIN on the login page or ask your admin\n\n"
        f"Need help? Reply to this email or contact your Conninter admin.\n\n"
        f"— Conninter\n"
        f"{APP_URL}\n"
    )

    html = f"""\
<div style="font-family:Georgia,serif;line-height:1.55;color:#1a1a1a;max-width:560px">
  <p style="margin:0 0 16px">Hi {safe_name},</p>
  <p style="margin:0 0 16px">
    Welcome to <strong>FUNNEL</strong> by Conninter — booth lead capture for exhibitions.
  </p>
  <p style="margin:0 0 8px"><strong>Your login PIN</strong> (keep this for your records):</p>
  <p style="margin:0 0 20px;font-size:28px;letter-spacing:0.2em;font-weight:700">{safe_pin}</p>
  <p style="margin:0 0 8px"><strong>Sign in</strong></p>
  <ol style="margin:0 0 20px;padding-left:20px">
    <li>Open <a href="{APP_URL}">{APP_URL}</a></li>
    <li>Enter the email on this account and your 4-digit PIN</li>
    <li>You are in — capture leads at the booth</li>
  </ol>
  <p style="margin:0 0 8px"><strong>How to use FUNNEL</strong></p>
  <ul style="margin:0 0 20px;padding-left:20px">
    <li><strong>New lead</strong> — fill in visitor details, company, and interests</li>
    <li><strong>Business card</strong> — photograph a card; FUNNEL can help fill the fields</li>
    <li><strong>Voice note</strong> — record a short booth note; it saves even if the network is slow</li>
    <li><strong>Offline</strong> — keep capturing; leads sync when you are back online</li>
    <li><strong>Follow-ups</strong> — add appointment notes when a visitor wants a callback</li>
    <li><strong>Share link</strong> — use your public form / QR so visitors can self-register</li>
  </ul>
  <p style="margin:0 0 8px"><strong>Tips</strong></p>
  <ul style="margin:0 0 20px;padding-left:20px">
    <li>Save this email so you always have your PIN</li>
    <li>Do not share your PIN with other booths</li>
    <li>If you forget it, use <em>Forgot PIN</em> on the login page or ask your admin</li>
  </ul>
  <p style="margin:0 0 16px">
    Need help? Reply to this email or contact your Conninter admin.
  </p>
  <p style="margin:0;color:#555">— Conninter<br/><a href="{APP_URL}">{APP_URL}</a></p>
</div>
"""

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
        logger.warning("Welcome/PIN email SMTP send failed", exc_info=True)
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
        logger.warning("Welcome/PIN email Resend send failed", exc_info=True)
        return False, "Could not send email"
