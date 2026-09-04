#!/usr/bin/env python3
"""Update MAIL_* keys in backend .env. Password is read from stdin (one line)."""
from __future__ import annotations

import re
import sys


def quote(v: str) -> str:
    if any(c in v for c in ' #"\'\\'):
        return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return v


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: patch_mail_env.py /path/to/.env < password", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    password = sys.stdin.readline().rstrip("\n\r")
    if not password:
        print("missing password on stdin", file=sys.stderr)
        sys.exit(2)

    updates = {
        "MAIL_ENABLED": "true",
        "MAIL_FROM": "FUNNEL <noreply@conninter.com>",
        "MAIL_SMTP_HOST": "smtp.zeptomail.in",
        "MAIL_SMTP_PORT": "465",
        "MAIL_SMTP_USER": "emailapikey",
        "MAIL_SMTP_PASSWORD": password,
        "MAIL_SMTP_SSL": "true",
    }

    try:
        text = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        text = ""

    lines = text.splitlines()
    keys_seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", line)
        if m and m.group(1) in updates:
            k = m.group(1)
            out.append(f"{k}={quote(updates[k])}")
            keys_seen.add(k)
        else:
            out.append(line)
    for k, v in updates.items():
        if k not in keys_seen:
            out.append(f"{k}={quote(v)}")

    open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print("env_updated")


if __name__ == "__main__":
    main()
