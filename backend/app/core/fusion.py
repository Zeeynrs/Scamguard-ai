from typing import List
from app.core.schemas import AudioAnalysisResult, VisionAnalysisResult, IntentAnalysisResult, RiskAssessment


def compute_rule_score(num_hits: int, scale: int = 3) -> float:
    return min(num_hits / scale, 1.0)


def compute_risk(
    audio: AudioAnalysisResult,
    vision: VisionAnalysisResult,
    intent: IntentAnalysisResult,
    weights: dict,
) -> RiskAssessment:
    rule_score = compute_rule_score(len(intent.tactics_detected))
    llm_score = intent.confidence if intent.is_scam else 0.0

    weighted = {
        "weighted_intent_llm": llm_score * weights["weight_intent_llm"],
        "weighted_intent_rules": rule_score * weights["weight_intent_rules"],
        "weighted_audio": audio.deepfake_score * weights["weight_audio"],
        "weighted_video": vision.deepfake_score * weights["weight_video"],
    }

    combined = sum(weighted.values())

    if combined >= 0.70:
        level = "critical"
    elif combined >= 0.40:
        level = "high"
    elif combined >= 0.15:
        level = "medium"
    else:
        level = "low"

    indications = []
    if rule_score >= 0.34:
        indications.append(f"Scam tactics triggered: {', '.join(intent.tactics_detected)}")
    if llm_score >= 0.6:
        indications.append("LLM intent classifier indicates coercive/fraudulent language")
    if audio.deepfake_score >= 0.6:
        indications.append("Audio contains synthetic-voice indications")
    if vision.deepfake_score >= 0.6:
        indications.append("Video face shows deepfake artifacts (blink/jitter/boundary)")

    recommendation = {
        "low": "Call appears normal. Stay alert for changes in tone or urgency.",
        "medium": "Some suspicious signals detected. Treat demands cautiously and verify independently.",
        "high": "Several scam indicators found. Do not share financial or OTP information. Ask caller for a verifiable identity and hang up if pressured.",
        "critical": "High-confidence scam indicators. End the call immediately. Contact the institution or family member directly through a known number.",
    }[level]

    return RiskAssessment(
        score=round(combined, 3),
        level=level,
        recommendation=recommendation,
        indications=indications,
        **weighted,
    )
