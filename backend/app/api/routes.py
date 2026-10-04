"""
ScamGuard Multimodal — REST and WebSocket API routes.
"""
import base64
import time
import numpy as np
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.schemas import (
    AnalysisReport, AudioAnalysisResult, VisionAnalysisResult, IntentAnalysisResult,
    RiskAssessment,
)
from app.core.fusion import compute_risk
from app.audio.stt import transcribe_bytes, pcm16_to_wav_bytes
from app.audio.deepfake import score_audio_bytes
from app.intent.llm import analyze_intent
from app.vision.analyzer import FaceAnalyzer

router = APIRouter()


class TextAnalysisRequest(BaseModel):
    text: str
    deepfake_audio_hint: float = 0.0
    deepfake_video_hint: float = 0.0


def _weights() -> dict:
    return {
        "weight_intent_llm": settings.weight_intent_llm,
        "weight_intent_rules": settings.weight_intent_rules,
        "weight_audio": settings.weight_audio,
        "weight_video": settings.weight_video,
    }


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "llm_provider": settings.llm_provider,
        "whisper_model": settings.whisper_model,
    }


@router.post("/analyze/text", response_model=AnalysisReport)
async def analyze_text(payload: TextAnalysisRequest):
    """
    Direct text analysis (transcript input).
    Runs intent engine + risk fusion with optional synthetic audio/video hints.
    Useful for testing without audio, and for calls where a transcript is already available.
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
    )


@router.post("/analyze/upload", response_model=AnalysisReport)
async def analyze_upload(request: Request, file: UploadFile = File(...)):
    """
    Full forensic analysis of an uploaded audio file (voice note / call recording).
    Audio -> STT -> intent + deepfake -> fused report.
    """
    # --- Enforce upload size limit (guard against memory exhaustion) ---
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
    transcript, language = transcribe_bytes(audio_bytes, suffix=suffix, language=settings.stt_language)

    # 2. Audio deepfake scoring
    audio_score, audio_indications = score_audio_bytes(audio_bytes, suffix=suffix)

    audio_result = AudioAnalysisResult(
        transcript=transcript,
        language=language,
        deepfake_score=audio_score,
        deepfake_indications=audio_indications,
    )

    # 3. Intent analysis (rules + LLM)
    intent_result = analyze_intent(transcript) if transcript else IntentAnalysisResult()

    # No video in upload mode
    vision_result = VisionAnalysisResult(face_detected=False)

    risk = compute_risk(audio_result, vision_result, intent_result, _weights())

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
    )


@router.websocket("/analyze/stream")
async def analyze_stream(websocket: WebSocket):
    """
    Real-time streaming analysis for live video calls.

    Protocol (client -> server): JSON text frames
      {"audio_chunk": "<base64 raw pcm16 le>", "video_frame": "<base64 jpeg>", "seq": N}

    Server -> client: JSON StreamUpdate with cumulative transcript and current risk.

    Audio chunks (raw PCM16 LE, 16kHz mono) are buffered. Every ~4 seconds, a new 3s
    segment is transcribed and appended to the cumulative transcript. Vision frames
    are processed per-frame and aggregated over the call duration.
    """
    await websocket.accept()
    start = time.time()
    analyzer = FaceAnalyzer()

    # Cumulative transcript built from segments
    full_transcript = ""
    
    # Audio buffering: we collect PCM samples and transcode to WAV on demand
    audio_buffer = bytearray()
    last_transcribed_offset = 0  # bytes already sent to STT
    SEGMENT_BYTES = 16000 * 2 * 3  # 3s @ 16kHz mono 16-bit = 96000 bytes
    ANALYSIS_INTERVAL = 4.0
    last_analysis = start

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

            # --- Audio chunk ingestion (raw PCM16 LE) ---
            if msg.get("audio_chunk"):
                try:
                    audio_buffer.extend(base64.b64decode(msg["audio_chunk"]))
                except Exception:
                    pass

            # --- Video frame processing ---
            if msg.get("video_frame"):
                try:
                    import cv2
                    raw = base64.b64decode(msg["video_frame"])
                    arr = np.frombuffer(raw, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if frame is not None:
                        analyzer.process_frame(frame)
                        latest["vision"] = analyzer.compute_result(now - start)
                except Exception as e:
                    print(f"[stream] vision error: {e}")

            # --- Periodic audio segment transcription (incremental) ---
            if (now - last_analysis) >= ANALYSIS_INTERVAL:
                new_bytes = len(audio_buffer) - last_transcribed_offset
                if new_bytes >= SEGMENT_BYTES:
                    # Grab a fresh 3s segment
                    segment_pcm = bytes(audio_buffer[last_transcribed_offset:last_transcribed_offset + SEGMENT_BYTES])
                    last_transcribed_offset += SEGMENT_BYTES

                    # Wrap in WAV and transcribe
                    try:
                        wav_bytes = pcm16_to_wav_bytes(segment_pcm, sample_rate=16000, channels=1)
                        seg_text, _ = transcribe_bytes(wav_bytes, suffix=".wav", language=settings.stt_language)
                        if seg_text:
                            full_transcript += (" " if full_transcript else "") + seg_text.strip()
                        
                        # Audio deepfake scoring (optional, on the last segment only to save CPU)
                        ascore, aind = score_audio_bytes(wav_bytes, suffix=".wav")
                        latest["audio_score"] = ascore
                        latest["audio_indications"] = aind
                    except Exception as e:
                        print(f"[stream] STT/audio error: {e}")

                    # Re-analyze intent on the cumulative transcript
                    if full_transcript:
                        latest["intent"] = analyze_intent(full_transcript)

                last_analysis = now

            # --- Fuse and emit ---
            audio_result = AudioAnalysisResult(
                transcript=full_transcript,
                language="auto",
                deepfake_score=latest["audio_score"],
                deepfake_indications=latest["audio_indications"],
            )
            risk = compute_risk(audio_result, latest["vision"], latest["intent"], _weights())

            await websocket.send_json({
                "seq": seq,
                "transcript_window": full_transcript,
                "risk": risk.model_dump(),
                "elapsed_seconds": round(now - start, 1),
                "vision": latest["vision"].model_dump(),
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[stream] connection error: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
