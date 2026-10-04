"""
Speech-to-Text engine.

Primary: Groq Whisper (whisper-large-v3-turbo) — fast, accurate, offloads CPU.
Fallback: faster-whisper (CTranslate2) running locally on CPU.

Supports audio files (.wav, .mp3, .ogg, .m4a, .flac, .webm) and raw PCM chunks.
Handles Indonesian, English, and code-switching automatically.
"""
import os
import tempfile
from typing import Tuple, Optional
from app.config import settings

_model_cache = None


def _get_stt_model():
    """Lazily load the local faster-whisper model (fallback only)."""
    global _model_cache
    if _model_cache is None:
        try:
            from faster_whisper import WhisperModel
            print(f"[stt] Loading faster-whisper model '{settings.whisper_model}' on {settings.whisper_device}...")
            _model_cache = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
        except Exception as e:
            print(f"[stt] Error loading faster-whisper model: {e}")
            _model_cache = False
    return _model_cache if _model_cache is not False else None


def _transcribe_groq(file_path: str, language: Optional[str] = None) -> Optional[Tuple[str, str]]:
    """
    Transcribe via Groq Whisper API. Returns (text, language) or None on failure.
    Uses the OpenAI-compatible audio transcription endpoint.
    """
    if not settings.groq_api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.groq_api_key,
        )
        with open(file_path, "rb") as f:
            kwargs = {
                "model": settings.groq_stt_model,
                "file": f,
                "response_format": "verbose_json",
                "temperature": 0.0,
            }
            # Groq accepts a language hint; omit for auto-detect
            if language and language != "auto":
                kwargs["language"] = language
            resp = client.audio.transcriptions.create(**kwargs)

        text = (getattr(resp, "text", "") or "").strip()
        lang = getattr(resp, "language", None) or "unknown"
        if not text:
            return None
        return text, lang
    except Exception as e:
        print(f"[stt] Groq Whisper error: {e}")
        return None


def _transcribe_local(file_path: str, language: Optional[str] = None) -> Tuple[str, str]:
    """Transcribe with the local faster-whisper model."""
    model = _get_stt_model()
    if not model:
        return "", "unknown"

    lang_param = None if (language in (None, "auto")) else language
    try:
        segments, info = model.transcribe(
            file_path,
            language=lang_param,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )
        text = " ".join([seg.text.strip() for seg in segments]).strip()
        detected_lang = info.language if info else "unknown"
        return text, detected_lang
    except Exception as e:
        print(f"[stt] Local transcription error for {file_path}: {e}")
        return "", "unknown"


def transcribe_file(file_path: str, language: Optional[str] = None) -> Tuple[str, str]:
    """
    Transcribes an audio file path.
    Returns (transcript_text, detected_language).

    Provider order depends on settings.stt_provider:
      - "groq"  : Groq only, then local fallback
      - "local" : local only
      - "auto"  : Groq first (if key present), then local
    """
    provider = (settings.stt_provider or "auto").lower()

    if provider in ("auto", "groq"):
        result = _transcribe_groq(file_path, language=language)
        if result:
            print("[stt] transcribed via 'groq'")
            return result
        if provider == "groq" or provider == "auto":
            print("[stt] Groq unavailable/failed, falling back to local faster-whisper")

    return _transcribe_local(file_path, language=language)


def transcribe_bytes(audio_bytes: bytes, suffix: str = ".wav", language: Optional[str] = None) -> Tuple[str, str]:
    """
    Convenience wrapper: saves bytes to temporary file, transcribes, and cleans up.
    """
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        return transcribe_file(tmp_path, language=language)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
