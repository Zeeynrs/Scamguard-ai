"""
Outbound notifications for Family Protection.

Sends a cross-verification ping to a Trust Circle member's Telegram account
using the Telegram Bot API directly (stdlib only, no bot-process dependency).

Design:
  * Best-effort: a failed send never breaks the API request.
  * Non-blocking: the HTTP call runs in a daemon thread so the request returns
    immediately.
  * Opt-in: if TELEGRAM_BOT_TOKEN is unset, notifications are silently skipped.
"""
import json
import logging
import os
import threading
import urllib.parse
import urllib.request

logger = logging.getLogger("scamguard.notify")

_API = "https://api.telegram.org/bot{token}/sendMessage"
_TIMEOUT = 8


def _token() -> str:
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def _send(chat_id: str, text: str) -> None:
    """Blocking send — always invoked from a worker thread."""
    token = _token()
    if not token or not chat_id:
        return
    try:
        payload = urllib.parse.urlencode(
            {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
        ).encode()
        req = urllib.request.Request(
            _API.format(token=token),
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = json.loads(resp.read().decode() or "{}")
            if not body.get("ok"):
                logger.warning("Telegram sendMessage not ok: %s", body.get("description"))
    except Exception as exc:  # never propagate — notification is best-effort
        logger.info("Telegram notify failed for %s: %s", chat_id, exc)


def notify_ping(contact_username: str, owner: str, claim: str, ping_id: str) -> bool:
    """
    Fire a verification-ping message to a Trust Circle contact.

    Returns True if a send was dispatched (thread started), False when there is
    nothing to send to (missing username or bot token).
    """
    handle = (contact_username or "").strip().lstrip("@")
    if not handle or not _token():
        return False

    text = (
        "🛡 *ScamGuard — Verification Ping*\n\n"
        f"Family *{owner}* needs to confirm an identity claim:\n"
        f"> {claim}\n\n"
        f"Ping ID: `{ping_id}`\n"
        "Open ScamGuard → Family Protection to confirm *Real identity* "
        "or flag *Impostor*."
    )
    threading.Thread(target=_send, args=(f"@{handle}", text), daemon=True).start()
    return True
