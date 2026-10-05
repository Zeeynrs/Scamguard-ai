"""Safe-word challenge/verify (normalized, accidental spaces/casing tolerant)."""
import re
import hashlib

_CHALLENGES = {
    "id": "Sebutkan kata sandi keluarga.",
    "en": "Tell me the family safe word.",
}


def _norm(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return "".join(c for c in s if c.isalnum() or c == " ") or s


def new_challenge(language: str = "en") -> str:
    return _CHALLENGES.get(language, _CHALLENGES["en"])


def evaluate_answer(answer: str, expected: str) -> bool:
    if not answer or not expected:
        return False
    return _norm(answer) == _norm(expected)
