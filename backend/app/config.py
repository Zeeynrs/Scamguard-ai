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
    llm_provider: Literal["openai", "groq", "ollama"] = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    groq_api_key: str = ""
    groq_model: str = "llama-3.1-8b-instant"

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3:8b-instruct"

    # STT
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    stt_language: str = "auto"

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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
