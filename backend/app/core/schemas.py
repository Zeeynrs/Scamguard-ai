from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class AudioAnalysisResult(BaseModel):
    transcript: str = ""
    language: str = "unknown"
    deepfake_score: float = Field(0.0, ge=0.0, le=1.0)
    deepfake_indications: List[str] = []
    audio_quality: str = "unknown"


class VisionAnalysisResult(BaseModel):
    face_detected: bool = False
    deepfake_score: float = Field(0.0, ge=0.0, le=1.0)
    blink_rate_per_min: Optional[float] = None
    jitter_score: float = 0.0
    boundary_blur_score: float = 0.0
    indications: List[str] = []


class IntentAnalysisResult(BaseModel):
    is_scam: bool = False
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    tactics_detected: List[str] = []
    evidence: List[str] = []
    risk_level: Literal["low", "medium", "high", "critical"] = "low"


class RiskAssessment(BaseModel):
    score: float = Field(0.0, ge=0.0, le=1.0)
    level: Literal["low", "medium", "high", "critical"] = "low"
    weighted_intent_llm: float = 0.0
    weighted_intent_rules: float = 0.0
    weighted_audio: float = 0.0
    weighted_video: float = 0.0
    indications: List[str] = []
    recommendation: str = ""


class AnalysisReport(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    mode: Literal["upload", "stream"] = "upload"
    duration_seconds: Optional[float] = None
    audio_result: AudioAnalysisResult
    vision_result: VisionAnalysisResult
    intent_result: IntentAnalysisResult
    risk: RiskAssessment
    raw_scores: dict = {}


class StreamFrame(BaseModel):
    audio_chunk: Optional[str] = None  # base64 pcm
    video_frame: Optional[str] = None  # base64 jpeg
    seq: int = 0


class StreamUpdate(BaseModel):
    seq: int = 0
    transcript_window: str = ""
    risk: RiskAssessment
    elapsed_seconds: float = 0.0
