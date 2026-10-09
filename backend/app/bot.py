"""
ScamGuard Telegram Bot — voice note / audio file analysis via Telegram.

Flow:
1. User sends voice note / audio / video note to bot
2. Bot downloads the file, runs full forensic analysis (STT -> deepfake + intent -> fusion)
3. Bot replies with structured report: risk level, score, tactics, evidence, recommendation
"""
import os
import logging
from typing import Optional
from dotenv import load_dotenv

# Load project-root .env (one level up from backend/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv()  # also try CWD

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application, CommandHandler, MessageHandler, ContextTypes, filters,
)

from app.intent.llm import analyze_intent
from app.core.fusion import compute_risk
from app.core.schemas import AudioAnalysisResult, VisionAnalysisResult, IntentAnalysisResult
from app.config import settings
from app.safety import build_guidance, store
from app.safety.db import get_conn, transaction
from app.safety.notify import notify_user_registered

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("scamguard.bot")

WEIGHTS = {
    "weight_intent_llm": settings.weight_intent_llm,
    "weight_intent_rules": settings.weight_intent_rules,
    "weight_audio": settings.weight_audio,
    "weight_video": settings.weight_video,
}

LEVEL_EMOJI = {"low": "🟢", "medium": "🟡", "high": "🟠", "critical": "🚨"}

TACTIC_NAMES = {
    "urgency": "⏱ Time pressure",
    "financial_demand": "💰 Financial demand",
    "credential_harvest": "🔑 OTP/credential harvest",
    "authority_impersonation": "👮 Authority impersonation",
    "isolation_tactic": "🔇 Isolation tactic",
    "reward_lure": "🎁 Reward/prize lure",
    "family_emergency": "🚑 Family emergency",
}


def _fmt_report(risk, intent, transcript, language, audio_score, duration):
    emoji = LEVEL_EMOJI[risk.level]
    pct = f"{risk.score * 100:.0f}%"

    lines = [
        f"{emoji} *ScamGuard Analysis* {emoji}",
        "",
        f"*Risk Level:* `{risk.level.upper()}` ({pct})",
        "",
        f"*Tactics detected:*",
    ]

    if intent.tactics_detected:
        for t in intent.tactics_detected:
            lines.append(f"  • {TACTIC_NAMES.get(t, t)}")
    else:
        lines.append("  • None")

    if intent.evidence:
        lines.append("")
        lines.append("*Evidence:*")
        for ev in intent.evidence[:5]:
            lines.append(f"  › \"{ev}\"")

    lines.append("")
    lines.append(f"*Audio deepfake indication:* {audio_score*100:.0f}%")
    if transcript:
        t = transcript if len(transcript) <= 300 else transcript[:300] + "…"
        lines.append("")
        lines.append(f"*Transcript* ({language}):")
        lines.append(f"> {t}")

    # --- Family Protection guidance ---
    owner = "default"
    sw = store.get_safe_word(owner)
    lang = "id" if language == "id" else "en"
    guidance = build_guidance(
        tactics=intent.tactics_detected,
        risk_level=risk.level,
        language=lang,
        safe_word_challenge="",  # don't leak safe word in chat
    )
    if guidance["reply_scripts"]:
        lines.append("")
        lines.append("🛡 *Family Protection*")
        for s in guidance["reply_scripts"]:
            lines.append(f"  ▸ *{s['title']}*")
            lines.append(f"    Say: _{s['say']}_")
            lines.append(f"    Avoid: _{s['avoid']}_")
    if guidance["verify_actions"]:
        lines.append("")
        lines.append("🔒 *Immediate actions:*")
        for act in guidance["verify_actions"]:
            lines.append(f"  • {act}")

    lines.append("")
    lines.append(f"*Recommendation:* {risk.recommendation}")

    return "\n".join(lines)


def _save_tg_user(update: Update) -> None:
    """Persist the Telegram user's chat_id + username so pings can reach them."""
    chat = update.effective_chat
    user = update.effective_user
    if not chat:
        return
    chat_id = str(chat.id)
    username = (user.username or "").strip().lower() if user else ""
    first_name = (user.first_name or "").strip() if user else ""
    last_name = (user.last_name or "").strip() if user else ""

    import time as _t
    now = _t.time()
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO telegram_users (chat_id, username, first_name, last_name, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET
                username=excluded.username,
                first_name=excluded.first_name,
                last_name=excluded.last_name,
                updated_at=excluded.updated_at
            """,
            (chat_id, username, first_name, last_name, now),
        )
    logger.info("Saved Telegram user: chat_id=%s username=@%s", chat_id, username or "?")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    _save_tg_user(update)

    user = update.effective_user
    name = (user.first_name or f"@{user.username}") if user else "there"
    await update.message.reply_text(
        f"🛡 *ScamGuard Multimodal Bot*\n\n"
        f"Halo {name}!\n\n"
        "Kirim voice note / rekaman panggilan yang mencurigakan, saya analisis:\n"
        "• Pola penipuan (taktik urgency, transfer, OTP)\n"
        "• Indikasi suara sintetis / AI voice clone\n"
        "• Skor risiko + rekomendasi tindakan\n\n"
        "Bahasa: Indonesia & Inggris\n\n"
        "Note: audio deepfake score adalah indikasi, bukan bukti absolut.\n\n"
        "✅ _Akun kamu sudah terdaftar — kamu bisa terima verification ping dari keluarga._",
        parse_mode=ParseMode.MARKDOWN,
    )

    if update.effective_chat:
        notify_user_registered(str(update.effective_chat.id), user.username or "" if user else "")


async def cmd_register(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Alias for /start — just re-saves the user identity."""
    if not update.message:
        return
    _save_tg_user(update)
    await update.message.reply_text(
        "✅ Terdaftar! Akun kamu bisa terima verification ping dari Trust Circle.",
    )


async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle inline button presses on verification ping messages."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    if len(parts) != 4 or parts[0] != "ping":
        return

    _, ping_id, verdict, owner = parts
    confirmed = verdict == "real"

    ping = store.respond(ping_id, confirmed_identity=confirmed, owner=owner)
    if not ping:
        if query.message:
            await query.edit_message_reply_markup(reply_markup=None)
            chat_id = query.message.chat.id if hasattr(query.message, "chat") else None
            if chat_id:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text="⚠️ Ping tidak ditemukan atau sudah kedaluwarsa.",
                )
        return

    status_label = "✅ Real identity confirmed" if confirmed else "🚨 Impostor flagged"
    emoji = "✅" if confirmed else "🚨"

    await query.edit_message_text(
        f"{emoji} *Verification Ping — Answered*\n\n"
        f"Family *{owner}*\n"
        f"> {ping.claim}\n\n"
        f"Result: *{status_label}*\n"
        f"Ping ID: `{ping_id}`",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await cmd_start(update, context)


async def _analyze_bytes(audio_bytes: bytes, suffix: str) -> dict:
    """Run full analysis pipeline on audio bytes."""
    from app.audio.stt import transcribe_bytes
    from app.audio.deepfake import score_audio_bytes

    transcript, language = transcribe_bytes(audio_bytes, suffix=suffix, language=settings.stt_language)
    audio_score, audio_indications = score_audio_bytes(audio_bytes, suffix=suffix)
    intent = analyze_intent(transcript) if transcript else IntentAnalysisResult()

    audio_result = AudioAnalysisResult(
        transcript=transcript, language=language,
        deepfake_score=audio_score, deepfake_indications=audio_indications,
    )
    vision_result = VisionAnalysisResult()
    risk = compute_risk(audio_result, vision_result, intent, WEIGHTS)

    return {"risk": risk, "intent": intent, "transcript": transcript,
            "language": language, "audio_score": audio_score}


async def handle_audio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = update.message
    tg_file = None
    suffix = ".ogg"

    if msg.voice:
        tg_file = await msg.voice.get_file()
        suffix = ".ogg"
        duration = msg.voice.duration
    elif msg.audio:
        tg_file = await msg.audio.get_file()
        suffix = "." + (msg.audio.file_name or "audio.mp3").split(".")[-1]
        duration = msg.audio.duration
    elif msg.video_note:
        tg_file = await msg.video_note.get_file()
        suffix = ".mp4"
        duration = msg.video_note.duration
    elif msg.document and msg.document.mime_type and msg.document.mime_type.startswith("audio"):
        tg_file = await msg.document.get_file()
        suffix = "." + (msg.document.file_name or "audio.bin").split(".")[-1]
        duration = msg.document.duration
    else:
        return

    wait = await msg.reply_text("🔎 Menganalisis audio…")

    try:
        data = await tg_file.download_as_bytearray()
        result = await _analyze_bytes(bytes(data), suffix)

        reply = _fmt_report(
            risk=result["risk"], intent=result["intent"],
            transcript=result["transcript"], language=result["language"],
            audio_score=result["audio_score"], duration=duration,
        )
        await wait.edit_text(reply, parse_mode=ParseMode.MARKDOWN)

    except Exception as e:
        logger.exception("analysis failed")
        await wait.edit_text(f"❌ Analisis gagal: {e}")


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """User can also paste a transcript directly."""
    wait = await update.message.reply_text("🔎 Menganalisis teks…")
    try:
        intent = analyze_intent(update.message.text)
        audio_result = AudioAnalysisResult(transcript=update.message.text, language="auto")
        risk = compute_risk(audio_result, VisionAnalysisResult(), intent, WEIGHTS)

        reply = _fmt_report(risk=risk, intent=intent, transcript=None,
                            language="text", audio_score=0.0, duration=None)
        await wait.edit_text(reply, parse_mode=ParseMode.MARKDOWN)
    except Exception as e:
        logger.exception("text analysis failed")
        await wait.edit_text(f"❌ Analisis gagal: {e}")


def build_application(token: str) -> Application:
    """Construct the bot Application with all handlers registered.

    Shared by long-polling mode (main()) and webhook mode (get_webhook_app()).
    """
    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("register", cmd_register))
    app.add_handler(CommandHandler("help", cmd_help))
    from telegram.ext import CallbackQueryHandler
    app.add_handler(CallbackQueryHandler(handle_callback_query))
    app.add_handler(MessageHandler(
        filters.VOICE | filters.AUDIO | filters.VIDEO_NOTE |
        (filters.Document.ALL & filters.Document.AUDIO), handle_audio))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    return app


# Lazily built Application used in webhook mode. The backend imports this
# module from request handlers, so nothing is constructed at import time.
webhook_app: Optional[Application] = None


async def get_webhook_app() -> Application:
    """Return the webhook-mode Application, building and initializing it once."""
    global webhook_app
    if webhook_app is not None:
        return webhook_app

    token = settings.telegram_bot_token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not set; cannot run bot in webhook mode")

    application = build_application(token)
    await application.initialize()
    webhook_app = application
    logger.info("ScamGuard bot Application initialized (webhook mode)")
    return application


async def process_webhook_update(update_data: dict) -> None:
    """Feed one raw Telegram update JSON into the bot's handler pipeline."""
    application = await get_webhook_app()
    update = Update.de_json(update_data, application.bot)
    await application.process_update(update)


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN not set")

    app = build_application(token)

    logger.info("ScamGuard bot starting (long polling)...")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()