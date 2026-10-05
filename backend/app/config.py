from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from typing import Literal

# Resolve project root (two levels up from backend/app/)
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_path = os.path.join(_PROJECT_ROOT, ".env")


class Settings(BaseSettings):
    """Runtime settings loaded from project-root .env."""

    # LLM provider
    llm_provider: Literal["openai", "groq", "ollama"] = "openai"

    # LLM
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3:8b-instruct"

    # STT
    stt_provider: str = "auto"  # auto | groq | local
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    stt_language: str = "auto"
    groq_stt_model: str = "whisper-large-v3-turbo"

    # Deepfake
    deepfake_enabled: bool = True
    deepfake_model_path: str = ""

    # Vision
    vision_enabled: bool = True
    vision_fps: int = 12

    # Fusion weights
    weight_intent_llm: float = 0.55
    weight_intent_rules: float = 0.25
    weight_audio: float = 0.12
    weight_video: float = 0.08

    # Server
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # --- Security (demo hardening) ---
    # Set to "development" to re-enable Swagger docs and permissive CORS.
    environment: str = "production"
    # Comma-separated list of allowed browser origins.
    cors_origins: str = (
        "https://scamguard.parallel-dungeons.site,"
        "https://api.parallel-dungeons.site,"
        "http://localhost:3000"
    )
    # Max requests per client IP per window.
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 60
    # Tighter limit for expensive endpoints (analyze/*) to protect LLM credits.
    rate_limit_expensive: int = 10
    # Max upload size for /analyze/upload (megabytes).
    max_upload_mb: int = 25
    # Optional shared access code. Empty = open demo. When set, clients must
    # send header "X-Access-Code: <value>".
    access_code: str = ""
    # SQLite persistence file for Family Protection data (trust circle,
    # safe-word hashes, verification pings). Empty = backend/data/scamguard.db.
    db_path: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
