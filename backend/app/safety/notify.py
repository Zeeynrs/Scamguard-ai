"""
Outbound notifications for Family Protection.

Sends a cross-verification ping to a Trust Circle member's Telegram account
using the Telegram Bot API directly (stdlib only, no bot-process dependency).

Design:
  * Best-effort: a failed send never breaks the API request.
  * Non-blocking: the HTTP call runs in a daemon thread so the request returns
    immediately.
  * Opt-in: if TELEGRAM_BOT_TOKEN is unset, notifications are silently skipped.

Key fix: bots can only message users by numeric chat_id, NOT by @username
( Telegram returns "chat not found" for @username unless the user has started
the bot). We resolve the contact's chat_id from the telegram_users table,
falling back to the stored telegram_chat_id column on the contact row.
"""
import json
import logging
import os
import threading
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from app.safety.db import get_conn

logger = logging.getLogger("scamguard.notify")

_API = "https://api.telegram.org/bot{token}/{method}"
_TIMEOUT = 8


def _token() -> str:
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def _resolve_chat_id(contact_username: str, contact_id: str = "") -> str:
    """Resolve a contact's numeric Telegram chat_id.

    Order of lookup:
      1. telegram_chat_id column on the trust_circle row (set at add or by /start).
      2. telegram_users table (captured when user /start-ed the bot).

    Returns empty string if not found — caller will skip the send.
    """
    handle = (contact_username or "").strip().lstrip("@")
    if not handle and not contact_id:
        return ""

    conn = get_conn()
    # 1. Check trust_circle row directly
    if contact_id:
        row = conn.execute(
            "SELECT telegram_chat_id FROM trust_circle WHERE id = ?",
            (contact_id,),
        ).fetchone()
        if row and row["telegram_chat_id"]:
            return row["telegram_chat_id"]

    # 2. Look up by username in telegram_users
    if handle:
        row = conn.execute(
            "SELECT chat_id FROM telegram_users WHERE username = ?",
            (handle,),
        ).fetchone()
        if row and row["chat_id"]:
            # Cache it on the contact row for next time
            if contact_id:
                conn.execute(
                    "UPDATE trust_circle SET telegram_chat_id = ? WHERE id = ?",
                    (row["chat_id"], contact_id),
                )
                conn.commit()
            return row["chat_id"]

    return ""


def _api_call(method: str, **params) -> dict:
    """Blocking Telegram Bot API call — always invoked from a worker thread."""
    token = _token()
    if not token:
        return {}
    try:
        payload = json.dumps(params).encode()
        req = urllib.request.Request(
            _API.format(token=token, method=method),
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = json.loads(resp.read().decode() or "{}")
            if not body.get("ok"):
                logger.warning("Telegram %s not ok: %s", method, body.get("description"))
            return body
    except Exception as exc:  # never propagate — notification is best-effort
        logger.info("Telegram %s failed: %s", method, exc)
        return {}


def _send_ping(chat_id: str, text: str, ping_id: str, owner: str) -> None:
    """Send ping message with inline confirm/impostor buttons."""
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "✅ Real identity", "callback_data": f"ping:{ping_id}:real:{owner}"},
                {"text": "🚨 Impostor", "callback_data": f"ping:{ping_id}:impostor:{owner}"},
            ]
        ]
    }
    _api_call(
        "sendMessage",
        chat_id=chat_id,
        text=text,
        parse_mode="Markdown",
        reply_markup=keyboard,
    )


def _format_ping_text(owner: str, claim: str, ping_id: str, details: Optional[Dict[str, Any]] = None) -> str:
    """Format an informative, high-clarity alert message for family/circle."""
    details = details or {}
    risk = (details.get("risk_level") or "").strip().lower()
    risk_badge = {
        "critical": "🚨 *RISIKO KRITIS*",
        "high": "🔴 *RISIKO TINGGI*",
        "medium": "🟡 *RISIKO SEDANG*",
        "low": "🟢 *RISIKO RENDAH*",
    }.get(risk, "⚠️ *PERMINTAAN VERIFIKASI*")

    lines = [
        f"🛡 *ScamGuard — Emergency Alert*",
        f"{risk_badge}",
        "",
        f"Anggota keluarga Anda *{owner}* sedang menghadapi situasi yang dicurigai penipuan.",
        "",
        f"📌 *Klaim/Pesan:*",
        f"> {claim}",
    ]

    # Context fields (show only those present)
    ctx_parts = []
    scammer_name = details.get("scammer_name")
    if scammer_name:
        ctx_parts.append(f"• *Nama Kontak:* {scammer_name}")
    scammer_handle = details.get("scammer_handle")
    if scammer_handle:
        ctx_parts.append(f"• *Nomor / Akun:* `{scammer_handle}`")
    scammer_channel = details.get("scammer_channel")
    if scammer_channel:
        ctx_parts.append(f"• *Kanal:* {scammer_channel}")
    threat_type = details.get("threat_type")
    if threat_type:
        ctx_parts.append(f"• *Modus Penipuan:* {threat_type}")
    amount_requested = details.get("amount_requested")
    if amount_requested:
        ctx_parts.append(f"• *Nominal / Rekening:* `{amount_requested}`")
    location = details.get("location")
    if location:
        ctx_parts.append(f"• *Lokasi Korban:* {location}")
    notes = details.get("notes")
    if notes:
        ctx_parts.append(f"• *Catatan Tambahan:* {notes}")
    evidence_url = details.get("evidence_url")
    if evidence_url:
        ctx_parts.append(f"• *Bukti Rekaman/Tangkapan:* [Lihat Bukti]({evidence_url})")

    if ctx_parts:
        lines.append("")
        lines.append("📋 *Detail Kejadian:*")
        lines.extend(ctx_parts)

    lines.extend([
        "",
        f"🆔 ID Verifikasi: `{ping_id}`",
        "",
        "⚠️ *Tindakan Anda Sangat Penting!*",
        "Apakah Anda yakin ini identitas asli atau orang yang benar, atau ini penipu?",
        "Segera konfirmasi melalui tombol di bawah:",
    ])
    return "\n".join(lines)


def notify_ping(contact_username: str, owner: str, claim: str, ping_id: str,
                contact_id: str = "", details: Optional[Dict[str, Any]] = None) -> bool:
    """
    Fire a verification-ping message to a Trust Circle contact with full victim context.

    Returns True if a send was dispatched (thread started), False when there is
    nothing to send to (missing chat_id or bot token).
    """
    if not _token():
        return False

    chat_id = _resolve_chat_id(contact_username, contact_id)
    if not chat_id:
        logger.info(
            "Ping %s: contact @%s has no chat_id (user hasn't started bot yet); "
            "skipping Telegram send.",
            ping_id, (contact_username or "").lstrip("@"),
        )
        return False

    text = _format_ping_text(owner=owner, claim=claim, ping_id=ping_id, details=details)
    threading.Thread(
        target=_send_ping, args=(chat_id, text, ping_id, owner), daemon=True
    ).start()
    return True


def notify_user_registered(chat_id: str, username: str, first_name: str = "") -> None:
    """Send a welcome message when a user /start-s the bot."""
    name = first_name or f"@{username}" if username else "there"
    text = (
        f"👋 Hi {name}!\n\n"
        "You're now registered with *ScamGuard AI*.\n"
        "Your Telegram account can receive *verification pings* "
        "from family members who added you to their Trust Circle.\n\n"
        "Just keep this chat — you'll get a message with ✅/🚨 buttons "
        "when someone needs to verify an identity claim."
    )
    threading.Thread(
        target=_api_call,
        kwargs={"method": "sendMessage", "chat_id": chat_id,
                "text": text, "parse_mode": "Markdown"},
        daemon=True,
    ).start()
