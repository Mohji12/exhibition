from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)


def mail_configured() -> bool:
    if not settings.mail_enabled:
        return False
    return bool(settings.resend_api_key.strip())


def send_pin_email(to_email: str, name: str, pin: str) -> tuple[bool, str]:
    """Send a login PIN email. Returns (ok, message). Stub until RESEND_API_KEY is set."""
    if not mail_configured():
        return False, "Email is not configured yet"
    try:
        import urllib.request

        payload = (
            '{"from":%s,"to":[%s],"subject":%s,"html":%s}'
            % (
                _json_str(settings.mail_from),
                _json_str(to_email),
                _json_str("Your FUNNEL login PIN"),
                _json_str(
                    f"<p>Hi {name},</p>"
                    f"<p>Your FUNNEL booth login PIN is <strong>{pin}</strong>.</p>"
                    f"<p>Sign in at https://www.conninter.com</p>"
                ),
            )
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
        logger.warning("PIN email send failed", exc_info=True)
        return False, "Could not send email"


def _json_str(value: str) -> str:
    import json

    return json.dumps(value)
