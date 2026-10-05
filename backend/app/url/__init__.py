"""
URL scam analyzer.
Fuses static domain signals (homoglyph, typosquatting, suspicious TLD) with
a lightweight HTTP probe and content-based intent classification.
"""
import re
import ssl
import urllib.parse
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx

from app.config import settings
from app.core.schemas import IntentAnalysisResult
from app.intent.llm import analyze_intent


# Common free/suspicious TLDs heavily abused by phishing campaigns.
SUSPICIOUS_TLDS = {
    "tk", "ml", "ga", "cf", "top", "xyz", "click", "link", "work", "date",
    "party", "racing", "win", "bid", "download", "men", "stream", "gq",
}

# Well-known brands often impersonated in URL scams.
BRAND_DOMAINS = [
    "bca", "bni", "bri", "mandiri", "bank", "paypal", "amazon", "apple",
    "microsoft", "google", "facebook", "instagram", "whatsapp", "telegram",
    "netflix", "stripe", "visa", "mastercard", "chase", "wellsfargo",
    "cimb", "danamon", "ocbc", "dbs", "maybank",
]

SUSPICIOUS_KEYWORDS = [
    "login", "verify", "verification", "confirm", "account", "secure",
    "update", "billing", "payment", "password", "otp", "token", "auth",
    "signin", "banking", "wallet", "claim", "reward", "prize", "won",
    "urgent", "suspended", "limited", "expired", "recover", "unlock",
]


def _domain_from_url(raw_url: str) -> Tuple[Optional[str], Optional[urllib.parse.ParseResult]]:
    raw = raw_url.strip()
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    try:
        parsed = urllib.parse.urlparse(raw)
        if not parsed.netloc:
            return None, parsed
        return parsed.netloc.lower(), parsed
    except Exception:
        return None, None


def _is_punycode(domain: str) -> bool:
    return domain.startswith("xn--")


def _has_homoglyph(domain: str) -> bool:
    """Detect characters outside the standard ASCII Latin set."""
    for ch in domain:
        o = ord(ch)
        if o > 127:
            return True
    return False


def _levenshtein(a: str, b: str) -> int:
    if len(a) < len(b):
        return _levenshtein(b, a)
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[-1] + 1, prev[j + 1] + 1, prev[j] + cost))
        prev = curr
    return prev[-1]


def _typosquatting_score(domain: str) -> Tuple[int, Optional[str]]:
    """Return (lowest distance, matched brand) against common brand domains.
    Skip exact brand containment to avoid false positives on legitimate domains.
    """
    # If the domain already contains a brand as a label (exact match), don't flag.
    parts = domain.split(".")
    for part in parts:
        if part in BRAND_DOMAINS:
            return 999, None

    best = 999
    match = None
    for brand in BRAND_DOMAINS:
        dist = _levenshtein(domain, brand)
        if dist < best:
            best = dist
            match = brand
    return best, match


def _path_suspicious_score(path: str) -> float:
    lower = path.lower()
    count = sum(1 for kw in SUSPICIOUS_KEYWORDS if kw in lower)
    return min(count * 0.15, 0.6)


@dataclass
class UrlSignals:
    domain: str
    final_url: str
    status_code: Optional[int]
    ssl_valid: bool
    redirect_count: int
    suspicious_tld: bool
    homoglyph: bool
    typosquatting_distance: int
    typosquatting_brand: Optional[str]
    path_score: float
    content_title: str = ""
    content_meta: str = ""
    content_text: str = ""
    fetch_error: Optional[str] = None


async def _probe_url(url: str) -> UrlSignals:
    domain, parsed = _domain_from_url(url)
    if not domain or not parsed:
        return UrlSignals(
            domain="",
            final_url=url,
            status_code=None,
            ssl_valid=False,
            redirect_count=0,
            suspicious_tld=False,
            homoglyph=False,
            typosquatting_distance=999,
            typosquatting_brand=None,
            path_score=0.0,
            fetch_error="Invalid URL",
        )

    # Static domain signals
    tld = domain.split(".")[-1] if "." in domain else ""
    suspicious_tld = tld in SUSPICIOUS_TLDS
    homoglyph = _has_homoglyph(domain) or _is_punycode(domain)
    bare = domain.replace("www.", "").split(":")[0]
    brand_core = bare.split(".")[0]
    typosquatting_distance, typosquatting_brand = _typosquatting_score(brand_core)
    path_score = _path_suspicious_score(parsed.path)

    signals = UrlSignals(
        domain=domain,
        final_url=url,
        status_code=None,
        ssl_valid=False,
        redirect_count=0,
        suspicious_tld=suspicious_tld,
        homoglyph=homoglyph,
        typosquatting_distance=typosquatting_distance,
        typosquatting_brand=typosquatting_brand,
        path_score=path_score,
    )

    # HTTP probe
    try:
        ssl_ctx = ssl.create_default_context()
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(8.0, connect=5.0),
            verify=ssl_ctx,
        ) as client:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            resp = await client.get(url, headers=headers)
            signals.status_code = resp.status_code
            signals.final_url = str(resp.url)
            signals.redirect_count = len(resp.history)
            signals.ssl_valid = True

            if resp.status_code == 200 and "text/html" in (resp.headers.get("content-type") or ""):
                html = resp.text[:120_000]  # cap to avoid huge pages
                signals.content_title = _extract_title(html)
                signals.content_meta = _extract_meta_description(html)
                signals.content_text = _extract_body_text(html)

    except ssl.SSLError:
        signals.ssl_valid = False
        signals.fetch_error = "SSL certificate error"
    except httpx.TimeoutException:
        signals.fetch_error = "Request timeout"
    except httpx.TooManyRedirects:
        signals.fetch_error = "Too many redirects"
    except Exception as e:
        signals.fetch_error = f"Fetch failed: {type(e).__name__}"

    return signals


def _extract_title(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def _extract_meta_description(html: str) -> str:
    m = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.I | re.S,
    )
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    return ""


def _extract_body_text(html: str) -> str:
    # Strip script/style, then convert tags to spaces and collapse whitespace.
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()[:8_000]


def _aggregate_url_score(signals: UrlSignals, intent: Optional[IntentAnalysisResult]) -> Tuple[float, str, List[str]]:
    score = 0.0
    level = "low"
    indications: List[str] = []

    if signals.suspicious_tld:
        score += 0.12
        indications.append(f"Suspicious TLD (.{signals.domain.split('.')[-1]})")
    if signals.homoglyph:
        score += 0.25
        indications.append("Homoglyph / punycode domain")
    if signals.typosquatting_distance <= 2 and signals.typosquatting_brand:
        score += 0.18
        indications.append(f"Possible typosquat of '{signals.typosquatting_brand}'")
    if signals.path_score > 0.0:
        score += signals.path_score
        indications.append("Suspicious URL path keywords")
    if not signals.ssl_valid and signals.fetch_error:
        score += 0.10
        indications.append("SSL/fetch issue")
    if signals.redirect_count > 1:
        score += 0.08
        indications.append(f"Multiple redirects ({signals.redirect_count})")

    if intent:
        # Only let LLM confidence drive the score when it actually flags a scam.
        # A benign page with moderate confidence should not elevate risk.
        if intent.is_scam:
            score += intent.confidence * 0.45
            indications.extend([f"Content: {t}" for t in intent.tactics_detected])
        else:
            score += intent.confidence * 0.15

    score = min(round(score, 3), 0.99)
    if score >= 0.7:
        level = "critical"
    elif score >= 0.5:
        level = "high"
    elif score >= 0.25:
        level = "medium"

    return score, level, indications


def _format_explanation(signals: UrlSignals, level: str, indications: List[str], language: str) -> str:
    tld = signals.domain.split(".")[-1] if "." in signals.domain else ""
    if language == "id":
        lines = [
            f"Domain yang diperiksa: {signals.domain}",
            f"Status HTTP: {signals.status_code or 'tidak tercapai'}",
            f"Redirect: {signals.redirect_count}",
            f"SSL valid: {'ya' if signals.ssl_valid else 'tidak / gagal'}",
        ]
        if signals.suspicious_tld:
            lines.append(f"TLD .{tld} sering disalahgunakan.")
        if signals.homoglyph:
            lines.append("Domain mengandung karakter tak lazim (homoglyph/punycode).")
        if signals.typosquatting_brand:
            lines.append(f"Domain mirip '{signals.typosquatting_brand}'.")
        lines.append(f"Tingkat risiko keseluruhan: {level.upper()}")
    else:
        lines = [
            f"Checked domain: {signals.domain}",
            f"HTTP status: {signals.status_code or 'unreachable'}",
            f"Redirects: {signals.redirect_count}",
            f"SSL valid: {'yes' if signals.ssl_valid else 'no / failed'}",
        ]
        if signals.suspicious_tld:
            lines.append(f"TLD .{tld} is frequently abused.")
        if signals.homoglyph:
            lines.append("Domain contains unusual characters (homoglyph/punycode).")
        if signals.typosquatting_brand:
            lines.append(f"Domain resembles '{signals.typosquatting_brand}'.")
        lines.append(f"Overall risk level: {level.upper()}")
    return "\n".join(lines)


async def analyze_url(raw_url: str, language: str = "en") -> dict:
    """Main entry point for URL analysis."""
    if not raw_url or not raw_url.strip():
        raise ValueError("URL cannot be empty")

    signals = await _probe_url(raw_url)

    # Build content context for intent classifier.
    content_parts = [signals.content_title, signals.content_meta, signals.content_text]
    content_text = "\n".join(p for p in content_parts if p).strip()

    if len(content_text) < 30:
        # Fallback: analyze the URL string itself (path + domain words).
        content_text = re.sub(r"[^a-zA-Z0-9\s]", " ", f"{signals.domain} {urllib.parse.unquote(signals.final_url)}")

    intent = analyze_intent(content_text) if content_text else None

    score, level, indications = _aggregate_url_score(signals, intent)

    explanation = _format_explanation(signals, level, indications, language)

    return {
        "url": raw_url,
        "final_url": signals.final_url,
        "domain": signals.domain,
        "status_code": signals.status_code,
        "ssl_valid": signals.ssl_valid,
        "redirect_count": signals.redirect_count,
        "risk_score": score,
        "risk_level": level,
        "indications": indications,
        "tactics_detected": intent.tactics_detected if intent else [],
        "evidence": intent.evidence if intent else [],
        "explanation": explanation,
        "content_preview": signals.content_text[:400],
        "fetch_error": signals.fetch_error,
    }
