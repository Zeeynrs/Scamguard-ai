"""
Speech-to-Text engine using faster-whisper (CTranslate2 backend).
Supports audio files (.wav, .mp3, .ogg, .m4a) and raw PCM chunks.
Handles Indonesian, English, and code-switching automatically.
"""
import os
import tempfile
from typing import Tuple, Optional
from app.config import settings

_model_cache = None


def _get_stt_model():
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


def transcribe_file(file_path: str, language: Optional[str] = None) -> Tuple[str, str]:
    """
    Transcribes an audio file path.
    Returns (transcript_text, detected_language).
    """
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
        print(f"[stt] Transcription error for {file_path}: {e}")
        return "", "unknown"


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
