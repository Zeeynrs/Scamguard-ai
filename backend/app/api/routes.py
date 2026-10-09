"""
ScamGuard Multimodal — REST and WebSocket API routes.
"""
import asyncio
import base64
import hmac
import time
from typing import Optional, List
import numpy as np
from pydantic import BaseModel
from fastapi import (
    APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect,
    HTTPException, Request, Query,
)
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.schemas import (
    AnalysisReport, AudioAnalysisResult, VisionAnalysisResult, IntentAnalysisResult,
    RiskAssessment, FamilyGuardGuidance, TextAnalysisRequest,
    TrustContact, VerificationPing,
)
from app.core.fusion import compute_risk
from app.audio.stt import transcribe_bytes, pcm16_to_wav_bytes
from app.audio.deepfake import score_audio_bytes
from app.intent.llm import analyze_intent
from app.vision.analyzer import FaceAnalyzer
from app.video.deepfake import VideoDeepfakeDetector
from app.safety import build_guidance, store, evaluate_answer
from app.safety.safeword import new_challenge
from app.safety.notify import notify_ping

router = APIRouter()

# Owner ID for Family Protection is provided via the X-Family-Owner header.
# It is NEVER taken from the request body, so one caller cannot impersonate
# another family's data just by changing a JSON field. In production this
# header should be set by an authenticated gateway; for the demo it is a
# self-declared label, but the server-side scoping is enforced the same way.
def _owner(request: Request) -> str:
    owner = request.headers.get("x-family-owner", "").strip()
    if not owner:
        raise HTTPException(
            status_code=400,
            detail="Missing X-Family-Owner header. Set a unique owner id to isolate family data.",
        )
    if len(owner) > 128:
        raise HTTPException(status_code=400, detail="Owner id too long (max 128 chars).")
    return owner


def _weights() -> dict:
    return {
        "weight_intent_llm": settings.weight_intent_llm,
        "weight_intent_rules": settings.weight_intent_rules,
        "weight_audio": settings.weight_audio,
        "weight_video": settings.weight_video,
    }


def _attach_family_guard(
    intent_result: IntentAnalysisResult,
    risk: RiskAssessment,
    language: str = "en",
    owner: str = "default",
    safe_word_attempt: str = "",
) -> FamilyGuardGuidance:
    """Compose safe word + reply scripts + verification action checklist."""
    passed: Optional[bool] = None
    expected = store.has_safe_word(owner) if owner else False
    if safe_word_attempt and expected:
        passed = store.verify_safe_word_attempt(owner, safe_word_attempt)

    has_safe_word = expected
    challenge = new_challenge(language) if has_safe_word or "family_emergency" in intent_result.tactics_detected else ""
    guidance_dict = build_guidance(
        tactics=intent_result.tactics_detected,
        risk_level=risk.level,
        language=language,
        safe_word_challenge=challenge,
    )

    return FamilyGuardGuidance(
        safe_word_challenge=guidance_dict["safe_word_challenge"],
        reply_scripts=guidance_dict["reply_scripts"],
        verify_actions=guidance_dict["verify_actions"],
        safe_word_check_passed=passed,
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@router.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "llm_provider": settings.llm_provider,
        "whisper_model": settings.whisper_model,
    }


# ---------------------------------------------------------------------------
# Core Analysis
# ---------------------------------------------------------------------------

@router.post("/analyze/text", response_model=AnalysisReport)
async def analyze_text(request: Request, payload: TextAnalysisRequest):
    """
    Direct text analysis (transcript input).
    Runs intent engine + risk fusion + family protection reply scripts.
    """
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    intent_result = analyze_intent(payload.text)

    audio_result = AudioAnalysisResult(
        transcript=payload.text,
        language="auto",
        deepfake_score=payload.deepfake_audio_hint,
        deepfake_indications=["Synthetic audio flag provided by client"] if payload.deepfake_audio_hint > 0.5 else [],
    )

    vision_result = VisionAnalysisResult(
        face_detected=payload.deepfake_video_hint > 0.0,
        deepfake_score=payload.deepfake_video_hint,
        indications=["Synthetic video flag provided by client"] if payload.deepfake_video_hint > 0.5 else [],
    )

    risk = compute_risk(audio_result, vision_result, intent_result, _weights())

    family_guard = _attach_family_guard(
        intent_result=intent_result,
        risk=risk,
        language=payload.language or "en",
        owner=request.headers.get("x-family-owner", "").strip(),
        safe_word_attempt=payload.safe_word,
    )

    return AnalysisReport(
        mode="upload",
        audio_result=audio_result,
        vision_result=vision_result,
        intent_result=intent_result,
        risk=risk,
        raw_scores={
            "intent_confidence": intent_result.confidence,
            "rule_tactics": len(intent_result.tactics_detected),
            "audio_deepfake": payload.deepfake_audio_hint,
            "video_deepfake": payload.deepfake_video_hint,
        },
        family_guard=family_guard,
    )


@router.post("/analyze/upload", response_model=AnalysisReport)
async def analyze_upload(
    request: Request,
    file: UploadFile = File(...),
    language: str = Query("auto"),
    safe_word: str = Query(""),
):
    """
    Full forensic analysis of an uploaded audio file.
    Audio -> STT -> intent + deepfake -> fused report + family protection guidance.
    """
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {settings.max_upload_mb} MB.",
        )

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(audio_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {settings.max_upload_mb} MB.",
        )

    suffix = "." + (file.filename or "audio.wav").split(".")[-1]

    # 1. Speech-to-text
    stt_lang = settings.stt_language if language == "auto" else language
    transcript, detected_lang = transcribe_bytes(audio_bytes, suffix=suffix, language=stt_lang)

    # 2. Audio deepfake scoring
    audio_score, audio_indications = score_audio_bytes(audio_bytes, suffix=suffix)

    audio_result = AudioAnalysisResult(
        transcript=transcript,
        language=detected_lang,
        deepfake_score=audio_score,
        deepfake_indications=audio_indications,
    )

    # 3. Intent analysis (rules + LLM)
    intent_result = analyze_intent(transcript) if transcript else IntentAnalysisResult()

    # No video in upload mode
    vision_result = VisionAnalysisResult(face_detected=False)

    risk = compute_risk(audio_result, vision_result, intent_result, _weights())

    family_guard = _attach_family_guard(
        intent_result=intent_result,
        risk=risk,
        language="id" if detected_lang == "id" or language == "id" else "en",
        owner=request.headers.get("x-family-owner", "").strip(),
        safe_word_attempt=safe_word,
    )

    return AnalysisReport(
        mode="upload",
        audio_result=audio_result,
        vision_result=vision_result,
        intent_result=intent_result,
        risk=risk,
        raw_scores={
            "audio_deepfake": audio_score,
            "intent_confidence": intent_result.confidence,
            "rule_tactics": len(intent_result.tactics_detected),
        },
        family_guard=family_guard,
    )


class UrlAnalysisRequest(BaseModel):
    url: str
    language: str = "en"


@router.post("/analyze/url")
async def analyze_url_endpoint(request: Request, payload: UrlAnalysisRequest):
    """
    URL scam analysis. Extracts domain signals, probes the target, runs content-based
    intent classification, and returns a fused risk report.
    """
    if not payload.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    from app.url import analyze_url
    try:
        result = await analyze_url(payload.url, language=payload.language)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


# ---------------------------------------------------------------------------
# Family Protection: Safe Word, Trust Circle, Verification Pings
# ---------------------------------------------------------------------------

class SetSafeWordRequest(BaseModel):
    safe_word: str


class SafeWordCheckRequest(BaseModel):
    answer: str


class AddContactRequest(BaseModel):
    name: str
    telegram_username: str = ""


class CreatePingRequest(BaseModel):
    claim: str


class RespondPingRequest(BaseModel):
    confirmed: bool


@router.post("/family/safe-word")
async def set_safe_word(request: Request, payload: SetSafeWordRequest):
    """Set or update the family safe word. Owner from X-Family-Owner header."""
    owner = _owner(request)
    word = payload.safe_word.strip()
    if not word:
        raise HTTPException(status_code=400, detail="Safe word cannot be empty")
    store.set_safe_word(owner, word)
    return {"status": "ok", "configured": True}


@router.get("/family/safe-word")
async def get_safe_word_status(request: Request):
    """Check whether a safe word is configured (without leaking the secret)."""
    owner = _owner(request)
    return {"configured": store.has_safe_word(owner)}


@router.post("/family/safe-word/verify")
async def verify_safe_word(request: Request, payload: SafeWordCheckRequest):
    """Verify an answer against the stored hash. Owner from X-Family-Owner."""
    owner = _owner(request)
    if not store.has_safe_word(owner):
        raise HTTPException(status_code=404, detail="No safe word configured for this family")
    match = store.verify_safe_word_attempt(owner, payload.answer)
    return {"passed": match}


@router.get("/family/contacts")
async def list_contacts(request: Request):
    owner = _owner(request)
    return {"contacts": [c.model_dump() for c in store.list_contacts(owner)]}


@router.post("/family/contacts")
async def add_contact(request: Request, payload: AddContactRequest):
    owner = _owner(request)
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    c = store.add_contact(owner, payload.name.strip(), payload.telegram_username.strip())
    return {"status": "ok", "contact": c.model_dump()}


@router.delete("/family/contacts/{contact_id}")
async def remove_contact(request: Request, contact_id: str):
    owner = _owner(request)
    ok = store.remove_contact(owner, contact_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "ok"}


@router.post("/family/pings")
async def create_verification_ping(request: Request, payload: CreatePingRequest):
    """Trigger a cross-verification ping to the Trust Circle."""
    owner = _owner(request)
    if not payload.claim.strip():
        raise HTTPException(status_code=400, detail="Claim cannot be empty")
    ping = store.create_ping(owner, payload.claim.strip())
    # Dispatch Telegram notifications to each Trust Circle contact (best-effort).
    for contact in store.list_contacts(owner):
        notify_ping(
            contact_username=contact.telegram_username,
            owner=owner,
            claim=payload.claim.strip(),
            ping_id=ping.id,
            contact_id=contact.id,
        )
    return {"status": "ok", "ping": ping.model_dump()}


@router.get("/family/pings")
async def list_pings(request: Request):
    owner = _owner(request)
    return {"pings": [p.model_dump() for p in store.list_pings(owner)]}


@router.post("/family/pings/{ping_id}/respond")
async def respond_to_ping(request: Request, ping_id: str, payload: RespondPingRequest):
    """Simulate or receive the family member's answer (real vs impostor)."""
    owner = _owner(request)
    ping = store.respond(ping_id, confirmed_identity=payload.confirmed, owner=owner)
    if not ping:
        raise HTTPException(status_code=404, detail="Ping not found or not owned by you")
    return {"status": "ok", "ping": ping.model_dump()}


# ---------------------------------------------------------------------------
# Feedback / Report Correction
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    excerpt: str
    is_scam: bool
    comment: str = ""

class ModerateFeedbackRequest(BaseModel):
    status: str   # "accepted" or "rejected"


@router.post("/feedback")
async def submit_feedback(payload: FeedbackRequest):
    """Report a false positive or false negative. Anti-spam enforced server-side."""
    try:
        result = store.add_feedback(
            excerpt=payload.excerpt,
            is_scam=payload.is_scam,
            comment=payload.comment,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/feedback")
async def list_feedback(status: str = Query("pending"), limit: int = Query(100)):
    """Moderation triage: browse pending / accepted / rejected reports."""
    rows = store.list_feedback(status=status, limit=limit)
    return {"reports": rows}


@router.post("/feedback/{feedback_id}/moderate")
async def moderate_feedback(feedback_id: str, payload: ModerateFeedbackRequest):
    """Accept or reject a user correction."""
    ok = store.moderate_feedback(feedback_id, status=payload.status)
    if not ok:
        raise HTTPException(status_code=404, detail="Report not found or invalid status")
    return {"status": "ok"}


@router.get("/feedback/counts")
async def feedback_counts():
    """Aggregate counts per status — feeds calibration dashboard."""
    return store.feedback_counts()


# ---------------------------------------------------------------------------
# Telegram Bot Webhook (dual mode)
# ---------------------------------------------------------------------------

@router.post("/bot/webhook")
async def bot_webhook(request: Request):
    """
    Receive Telegram updates via webhook.

    Active only when settings.bot_webhook_url is set. Telegram POSTs update JSON
    here; we feed it into the same Application the polling bot container would
    run. Optional bot_webhook_secret is verified via the
    X-Telegram-Bot-Api-Secret-Token header.
    """
    if not settings.bot_webhook_url:
        return JSONResponse(
            status_code=404,
            content={"detail": "Webhook mode disabled. Set BOT_WEBHOOK_URL to enable."},
        )

    # Verify secret token (if configured) to reject forged requests.
    if settings.bot_webhook_secret:
        supplied = request.headers.get("x-telegram-bot-api-secret-token", "")
        if not hmac.compare_digest(supplied, settings.bot_webhook_secret):
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid webhook secret token."},
            )

    try:
        update_data = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid JSON body."},
        )

    try:
        from app.bot import process_webhook_update
        await process_webhook_update(update_data)
    except Exception as e:
        print(f"[webhook] failed to process update: {e}")
        # Per Telegram docs, still return 200 so they don't retry forever;
        # log and move on.
        return JSONResponse(
            status_code=200,
            content={"status": "error", "detail": "Update processing failed."},
        )

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Streaming (Live Call Monitor)
# ---------------------------------------------------------------------------

@router.websocket("/analyze/stream")
async def analyze_stream(websocket: WebSocket):
    await websocket.accept()
    start = time.time()
    analyzer = FaceAnalyzer()
    deepfake_detector = VideoDeepfakeDetector(window_seconds=10.0)

    full_transcript = ""
    audio_buffer = bytearray()
    last_transcribed_offset = 0
    SEGMENT_BYTES = 16000 * 2 * 3
    ANALYSIS_INTERVAL = 4.0
    last_analysis = start

    MAX_AUDIO_BUFFER_BYTES = 16000 * 2 * 30
    MAX_TRANSCRIPT_CHARS = 4000
    MAX_TRANSCRIPT_SENT = 6000
    STT_TIMEOUT_SECONDS = 20.0
    MAX_CALL_SECONDS = 3600
    last_error_emit = 0.0

    latest = {
        "audio_score": 0.0,
        "audio_indications": [],
        "intent": IntentAnalysisResult(),
        "vision": VisionAnalysisResult(),
    }

    try:
        while True:
            msg = await websocket.receive_json()
            seq = msg.get("seq", 0)
            now = time.time()

            if (now - start) > MAX_CALL_SECONDS:
                await websocket.send_json({"error": "Max call duration reached (1h). Reconnect to continue."})
                break

            if msg.get("audio_chunk"):
                try:
                    audio_buffer.extend(base64.b64decode(msg["audio_chunk"]))
                    if len(audio_buffer) > MAX_AUDIO_BUFFER_BYTES:
                        trim_at = len(audio_buffer) - MAX_AUDIO_BUFFER_BYTES
                        audio_buffer = audio_buffer[trim_at:]
                        last_transcribed_offset = max(0, last_transcribed_offset - trim_at)
                except Exception:
                    pass

            if msg.get("video_frame"):
                try:
                    import cv2
                    raw = base64.b64decode(msg["video_frame"])
                    arr = np.frombuffer(raw, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if frame is not None:
                        deepfake_result = deepfake_detector.analyze_frame(frame)
                        analyzer.process_frame(frame)
                        base_vision = analyzer.compute_result(now - start)
                        latest["vision"] = VisionAnalysisResult(
                            face_detected=deepfake_result["face_detected"] or base_vision.face_detected,
                            deepfake_score=max(deepfake_result["deepfake_score"], base_vision.deepfake_score),
                            blink_rate_per_min=deepfake_result.get("blink_rate", 0.0),
                            jitter_score=deepfake_result.get("jitter_score", 0.0),
                            indications=(deepfake_result.get("indications", []) + base_vision.indications)
                        )
                except Exception as e:
                    print(f"[stream] vision error: {e}")

            if (now - last_analysis) >= ANALYSIS_INTERVAL:
                new_bytes = len(audio_buffer) - last_transcribed_offset
                if new_bytes >= SEGMENT_BYTES:
                    segment_pcm = bytes(audio_buffer[last_transcribed_offset:last_transcribed_offset + SEGMENT_BYTES])
                    last_transcribed_offset += SEGMENT_BYTES

                    try:
                        wav_bytes = pcm16_to_wav_bytes(segment_pcm, sample_rate=16000, channels=1)

                        def _blocking_stt():
                            return transcribe_bytes(wav_bytes, suffix=".wav", language=settings.stt_language)

                        seg_text, _ = await asyncio.wait_for(
                            asyncio.get_event_loop().run_in_executor(None, _blocking_stt),
                            timeout=STT_TIMEOUT_SECONDS
                        )

                        if seg_text:
                            full_transcript += (" " if full_transcript else "") + seg_text.strip()
                            if len(full_transcript) > MAX_TRANSCRIPT_CHARS:
                                full_transcript = full_transcript[-MAX_TRANSCRIPT_CHARS:]

                        ascore, aind = score_audio_bytes(wav_bytes, suffix=".wav")
                        latest["audio_score"] = ascore
                        latest["audio_indications"] = aind
                    except asyncio.TimeoutError:
                        if (now - last_error_emit) > 30.0:
                            print(f"[stream] STT timeout after {STT_TIMEOUT_SECONDS}s")
                            last_error_emit = now
                    except Exception as e:
                        if (now - last_error_emit) > 30.0:
                            print(f"[stream] STT/audio error: {e}")
                            last_error_emit = now

                    if full_transcript:
                        latest["intent"] = analyze_intent(full_transcript)

                last_analysis = now

            audio_result = AudioAnalysisResult(
                transcript=full_transcript,
                language="auto",
                deepfake_score=latest["audio_score"],
                deepfake_indications=latest["audio_indications"],
            )
            risk = compute_risk(audio_result, latest["vision"], latest["intent"], _weights())

            transcript_window = full_transcript[-MAX_TRANSCRIPT_SENT:] if len(full_transcript) > MAX_TRANSCRIPT_SENT else full_transcript

            # Real-time family protection guidance
            guidance = _attach_family_guard(
                intent_result=latest["intent"],
                risk=risk,
                language="id" if settings.stt_language == "id" else "en",
                owner="default",
            )

            await websocket.send_json({
                "seq": seq,
                "transcript_window": transcript_window,
                "risk": risk.model_dump(),
                "elapsed_seconds": round(now - start, 1),
                "vision": latest["vision"].model_dump(),
                "audio": audio_result.model_dump(),
                "family_guard": guidance.model_dump(),
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[stream] connection error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass