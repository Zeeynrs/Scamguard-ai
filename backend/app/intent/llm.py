"""
LLM-based scam tactic classifier.
Supports: OpenAI (GPT-4o-mini default), Groq (Llama-3), or Ollama (fully local).
Outputs structured Pydantic analysis.
"""
import json
from typing import Optional
from app.config import settings
from app.core.schemas import IntentAnalysisResult
from app.intent.rules import match_patterns


PROMPT_SYSTEM = """You are ScamGuard's forensic scam intent classifier.
Analyze the following transcript of a voice/video call (available in English, Indonesian, or code-switched).
Determine if the caller is conducting a scam, impersonation, or social-engineering attack.

Focus on:
1. Urgent pressure or false emergency (family in danger, immediate arrest, immediate account block).
2. Demands for immediate financial transfer, cryptocurrency, gift cards, or administrative fees.
3. Harvesting credentials: OTP, PIN, password, card CVC/CVV.
4. Authority impersonation: police, bank security, tax, court, corporate executives.
5. Coercive isolation: "don't hang up", "don't tell anyone", "stay on the line".
6. Unsolicited lottery, prize, cashback, or refund lures.

Return ONLY a valid JSON object matching this exact schema:
{
  "is_scam": boolean,
  "confidence": float between 0.0 and 1.0,
  "tactics_detected": list of strings (e.g. ["urgency", "financial_demand", "authority_impersonation"]),
  "evidence": list of short verbatim quotes from the text illustrating each tactic,
  "risk_level": "low" | "medium" | "high" | "critical"
}
"""


def _classify_with_openai(text: str) -> Optional[dict]:
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": PROMPT_SYSTEM},
                {"role": "user", "content": f"Transcript to analyze:\n\n\"{text}\""},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=600,
            timeout=10.0,
        )
        content = resp.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print(f"[intent.llm] OpenAI error: {e}")
        return None


def _classify_with_groq(text: str) -> Optional[dict]:
    if not settings.groq_api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.groq_api_key,
        )
        resp = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": PROMPT_SYSTEM},
                {"role": "user", "content": f"Transcript to analyze:\n\n\"{text}\""},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=600,
            timeout=10.0,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        print(f"[intent.llm] Groq error: {e}")
        return None


def _classify_with_ollama(text: str) -> Optional[dict]:
    try:
        import httpx
        url = f"{settings.ollama_host}/api/chat"
        payload = {
            "model": settings.ollama_model,
            "messages": [
                {"role": "system", "content": PROMPT_SYSTEM},
                {"role": "user", "content": f"Transcript to analyze:\n\n\"{text}\""},
            ],
            "format": "json",
            "stream": False,
        }
        r = httpx.post(url, json=payload, timeout=20.0)
        r.raise_for_status()
        data = r.json()
        return json.loads(data["message"]["content"])
    except Exception as e:
        print(f"[intent.llm] Ollama error: {e}")
        return None


def analyze_intent(text: str) -> IntentAnalysisResult:
    """
    Hybrid intent analyzer:
    1. Runs fast rule-based regex patterns (always available, deterministic).
    2. Runs LLM classification based on configured provider (OpenAI -> Groq -> Ollama fallback).
    3. Fuses both into a single IntentAnalysisResult.
    """
    rule_tactics, rule_evidence = match_patterns(text)

    # Call LLM based on provider preference
    raw = None
    if settings.llm_provider == "openai":
        raw = _classify_with_openai(text)
    elif settings.llm_provider == "groq":
        raw = _classify_with_groq(text)
    elif settings.llm_provider == "ollama":
        raw = _classify_with_ollama(text)

    # Fallback to rule-based only if LLM failed or not configured
    if not raw:
        num_rules = len(rule_tactics)
        is_scam = num_rules >= 2
        confidence = min(num_rules * 0.35, 0.95) if is_scam else (0.4 if num_rules == 1 else 0.0)
        risk = "critical" if num_rules >= 3 else ("high" if num_rules == 2 else ("medium" if num_rules == 1 else "low"))
        return IntentAnalysisResult(
            is_scam=is_scam,
            confidence=round(confidence, 3),
            tactics_detected=rule_tactics,
            evidence=rule_evidence,
            risk_level=risk,
        )

    # Merge rule evidence and LLM output
    combined_tactics = sorted(list(set(rule_tactics) | set(raw.get("tactics_detected", []))))
    combined_evidence = list(dict.fromkeys(rule_evidence + raw.get("evidence", [])))

    return IntentAnalysisResult(
        is_scam=bool(raw.get("is_scam", False)),
        confidence=float(raw.get("confidence", 0.0)),
        tactics_detected=combined_tactics,
        evidence=combined_evidence,
        risk_level=raw.get("risk_level", "low"),
    )
