"""
ScamGuard Multimodal — REST and WebSocket API routes.
"""
import base64
import time
import numpy as np
from typing import Optional
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.schemas import (
    AnalysisReport, AudioAnalysisResult, VisionAnalysisResult, IntentAnalysisResult,
    RiskAssessment,
)
from app.core.fusion import compute_risk
from app.audio.stt import transcribe_bytes
from app.audio.deepfake import score_audio_bytes
from app.intent.llm import analyze_intent
from app.vision.analyzer import FaceAnalyzer

router = APIRouter()


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


@router.post("/analyze/upload", response_model=AnalysisReport)
async def analyze_upload(file: UploadFile = File(...)):
    """
    Full forensic analysis of an uploaded audio file (voice note / call recording).
    Audio -> STT -> intent + deepfake -> fused report.
    """
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

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
    Real-time streaming analysis.

    Protocol (client -> server): JSON text frames
      {"audio_chunk": "<base64 webm/opus or pcm16>", "video_frame": "<base64 jpeg>", "seq": N}

    Server -> client: JSON StreamUpdate with rolling transcript window and risk.

    Audio chunks are buffered into a rolling window (~6s); the window is re-analyzed
    every ~3s for STT + intent, while vision frames are processed per-frame.
    """
    await websocket.accept()
    start = time.time()
    analyzer = FaceAnalyzer()

    audio_buffer = bytearray()
    audio_suffix = ".webm"
    last_analysis = start
    ANALYSIS_INTERVAL = 3.0
    WINDOW_SECONDS = 6.0

    latest = {
        "transcript": "",
        "language": "unknown",
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

            # --- Audio chunk ingestion ---
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

            # --- Periodic audio re-analysis ---
            if (now - last_analysis) >= ANALYSIS_INTERVAL and len(audio_buffer) > 8000:
                abytes = bytes(audio_buffer)
                transcript, language = transcribe_bytes(abytes[-160000:], suffix=audio_suffix,
                                                        language=settings.stt_language)
                ascore, aind = score_audio_bytes(abytes[-160000:], suffix=audio_suffix)
                intent = analyze_intent(transcript) if transcript else IntentAnalysisResult()

                latest.update({
                    "transcript": transcript,
                    "language": language,
                    "audio_score": ascore,
                    "audio_indications": aind,
                    "intent": intent,
                })
                last_analysis = now

            # --- Fuse and emit ---
            audio_result = AudioAnalysisResult(
                transcript=latest["transcript"],
                language=latest["language"],
                deepfake_score=latest["audio_score"],
                deepfake_indications=latest["audio_indications"],
            )
            risk = compute_risk(audio_result, latest["vision"], latest["intent"], _weights())

            await websocket.send_json({
                "seq": seq,
                "transcript_window": latest["transcript"],
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
