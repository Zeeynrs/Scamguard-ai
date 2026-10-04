"""
ScamGuard Multimodal — lightweight security middleware.

No external dependencies: a simple in-memory sliding-window rate limiter keyed
by client IP, plus helpers for origin checks and access-code verification.
Good enough for a single-instance hackathon deployment.
"""
import time
import threading
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


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
    """

    def __init__(self, app, rate_limit: int, window: int, access_code: str = ""):
        super().__init__(app)
        self.limiter = RateLimiter(rate_limit, window)
        self.access_code = access_code or ""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Always allow health checks and CORS preflight
        if request.method == "OPTIONS" or path == "/api/health":
            return await call_next(request)

        # --- Access-code gate ---
        if self.access_code:
            supplied = request.headers.get("x-access-code", "")
            if supplied != self.access_code:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid or missing access code."},
                )

        # --- Rate limiting ---
        ip = client_ip(request)
        if not self.limiter.allow(ip):
            retry = self.limiter.retry_after(ip)
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(retry)},
            )

        return await call_next(request)
