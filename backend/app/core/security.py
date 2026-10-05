"""
ScamGuard Multimodal — lightweight security middleware.

No external dependencies: a simple in-memory sliding-window rate limiter keyed
by client IP, plus helpers for origin checks and access-code verification.
Good enough for a single-instance hackathon deployment.

v2 — tiered rate limits:
  - Cheap endpoints (health, family, static): standard limit
  - Expensive endpoints (analyze/*): tighter limit to protect LLM credits
"""
import time
import threading
from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# Endpoints that invoke LLM / Whisper / torch — expensive in time and money.
_EXPENSIVE_PREFIXES = ("/api/analyze/",)

# Endpoints that must bypass the access-code gate and per-IP rate limiter:
# Telegram delivers every update from its own server IPs, so an IP-based limit
# would starve the bot, and Telegram cannot send our X-Access-Code header.
# The endpoint authenticates callers itself via the webhook secret token.
_UNTHROTTLED_PATHS = ("/api/bot/webhook",)


class RateLimiter:
    """Sliding-window counter: max `limit` events per `window` seconds per key."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            dq = self._hits[key]
            # Drop timestamps outside the window
            while dq and (now - dq[0]) > self.window:
                dq.popleft()
            if len(dq) >= self.limit:
                return False
            dq.append(now)
            return True

    def retry_after(self, key: str) -> int:
        now = time.time()
        with self._lock:
            dq = self._hits.get(key)
            if not dq:
                return 0
            remaining = self.window - (now - dq[0])
            return max(1, int(remaining) + 1)

    def prune(self, max_age: float = 300.0) -> int:
        """Remove stale entries older than *max_age* seconds. Returns count removed."""
        now = time.time()
        removed = 0
        with self._lock:
            stale_keys = [k for k, dq in self._hits.items() if dq and (now - dq[-1]) > max_age]
            for k in stale_keys:
                del self._hits[k]
                removed += 1
        return removed


def client_ip(request: Request) -> str:
    """Best-effort client IP, honoring Cloudflare's CF-Connecting-IP header."""
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Applies, in order:
      1. Access-code gate (only if settings.access_code is set) — skips /api/health.
      2. Per-IP rate limiting — skips preflight OPTIONS and /api/health.
         Uses a tighter limit for expensive (analyze) endpoints.
      3. Request body size cap for non-file endpoints.
    """

    # Max body size for non-upload POST/PUT/PATCH (bytes). 100 KB.
    MAX_BODY_BYTES = 100 * 1024

    def __init__(
        self,
        app,
        rate_limit: int = 30,
        rate_limit_expensive: int = 10,
        window: int = 60,
        access_code: str = "",
    ):
        super().__init__(app)
        self.limiter_standard = RateLimiter(rate_limit, window)
        self.limiter_expensive = RateLimiter(rate_limit_expensive, window)
        self.access_code = access_code or ""

    def _is_expensive(self, path: str) -> bool:
        return any(path.startswith(p) for p in _EXPENSIVE_PREFIXES)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Always allow health checks, CORS preflight, and authenticated Telegram
        # webhook traffic (the endpoint performs its own secret-token check).
        if (
            request.method == "OPTIONS"
            or path == "/api/health"
            or path in _UNTHROTTLED_PATHS
        ):
            return await call_next(request)

        # --- Access-code gate ---
        if self.access_code:
            supplied = request.headers.get("x-access-code", "")
            if supplied != self.access_code:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid or missing access code."},
                )

        # --- Rate limiting (tiered) ---
        ip = client_ip(request)
        limiter = (
            self.limiter_expensive
            if self._is_expensive(path)
            else self.limiter_standard
        )
        if not limiter.allow(ip):
            retry = limiter.retry_after(ip)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(retry)},
            )

        # --- Body size cap for non-upload endpoints ---
        if request.method in ("POST", "PUT", "PATCH") and not path.startswith(
            "/api/analyze/upload"
        ):
            content_length = request.headers.get("content-length")
            if content_length and content_length.isdigit():
                if int(content_length) > self.MAX_BODY_BYTES:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={
                            "detail": f"Request body too large. Max {self.MAX_BODY_BYTES // 1024} KB."
                        },
                    )

        return await call_next(request)
