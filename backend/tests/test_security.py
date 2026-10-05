"""
Tests for the public-endpoint hardening middleware (app.core.security).

Covers the three protections shipped in the hardening pass:
  1. Tiered per-IP rate limiting (cheap vs expensive /api/analyze/* routes)
  2. Request body size cap on non-upload endpoints
  3. Optional access-code gate

Uses a throwaway FastAPI app so the tests never touch real LLM/Whisper paths.
"""
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import security
from app.core.security import RateLimiter, SecurityMiddleware


# ---------------------------------------------------------------------------
# RateLimiter unit behaviour
# ---------------------------------------------------------------------------

def test_rate_limiter_allows_up_to_limit_then_blocks():
    rl = RateLimiter(limit=3, window=60)

    assert [rl.allow("1.2.3.4") for _ in range(3)] == [True, True, True]
    assert rl.allow("1.2.3.4") is False


def test_rate_limiter_keys_are_independent():
    rl = RateLimiter(limit=1, window=60)

    assert rl.allow("ip-a") is True
    assert rl.allow("ip-b") is True
    assert rl.allow("ip-a") is False


def test_rate_limiter_window_slides_open_again(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(security.time, "time", lambda: now["t"])

    rl = RateLimiter(limit=1, window=60)
    assert rl.allow("ip") is True
    assert rl.allow("ip") is False

    now["t"] += 61  # step past the window
    assert rl.allow("ip") is True


def test_retry_after_is_at_least_one_second_when_blocked():
    rl = RateLimiter(limit=1, window=60)
    assert rl.allow("ip") is True
    assert rl.retry_after("ip") >= 1
    assert rl.retry_after("never-seen-ip") == 0


def test_prune_removes_stale_keys(monkeypatch):
    now = {"t": 1000.0}
    monkeypatch.setattr(security.time, "time", lambda: now["t"])

    rl = RateLimiter(limit=5, window=60)
    rl.allow("old")
    now["t"] += 301  # older than max_age default (300s)
    rl.allow("fresh")

    assert rl.prune() == 1
    assert set(rl._hits) == {"fresh"}


# ---------------------------------------------------------------------------
# Middleware behaviour
# ---------------------------------------------------------------------------

def build_client(**middleware_kwargs) -> TestClient:
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.post("/api/analyze/text")
    async def analyze(payload: dict):
        return {"ok": True}

    @app.post("/api/analyze/upload")
    async def upload(payload: dict):
        return {"ok": True}

    @app.post("/api/family/contacts")
    async def family(payload: dict):
        return {"ok": True}

    app.add_middleware(SecurityMiddleware, **middleware_kwargs)
    return TestClient(app)


def test_expensive_endpoint_uses_tighter_limit():
    client = build_client(rate_limit=30, rate_limit_expensive=2, window=60)

    codes = [
        client.post("/api/analyze/text", json={"text": "hi"}).status_code
        for _ in range(3)
    ]

    assert codes == [200, 200, 429]


def test_standard_endpoint_keeps_full_limit_while_expensive_is_tight():
    client = build_client(rate_limit=5, rate_limit_expensive=1, window=60)

    assert client.post("/api/analyze/text", json={"text": "hi"}).status_code == 200
    assert client.post("/api/analyze/text", json={"text": "hi"}).status_code == 429

    # Cheap route has its own bucket, unaffected by the analyze traffic.
    codes = [
        client.post("/api/family/contacts", json={"name": "Anak"}).status_code
        for _ in range(2)
    ]
    assert codes == [200, 200]


def test_rate_limited_response_carries_retry_after_header():
    client = build_client(rate_limit=1, rate_limit_expensive=1, window=60)

    client.post("/api/analyze/text", json={"text": "hi"})
    blocked = client.post("/api/analyze/text", json={"text": "hi"})

    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_health_is_never_rate_limited():
    client = build_client(rate_limit=1, rate_limit_expensive=1, window=60)

    codes = [client.get("/api/health").status_code for _ in range(5)]

    assert codes == [200] * 5


def test_preflight_options_bypasses_rate_limit():
    client = build_client(rate_limit=1, rate_limit_expensive=1, window=60)

    for _ in range(5):
        resp = client.options("/api/analyze/text")
        assert resp.status_code != 429


def test_body_over_cap_is_rejected_with_413():
    client = build_client(rate_limit=30, rate_limit_expensive=30, window=60)

    oversized = b"x" * (SecurityMiddleware.MAX_BODY_BYTES + 1)
    resp = client.post(
        "/api/analyze/text",
        content=oversized,
        headers={"content-type": "application/json"},
    )

    assert resp.status_code == 413


def test_body_at_cap_is_allowed_through():
    client = build_client(rate_limit=30, rate_limit_expensive=30, window=60)

    at_cap = b"x" * SecurityMiddleware.MAX_BODY_BYTES
    resp = client.post(
        "/api/analyze/text",
        content=at_cap,
        headers={"content-type": "application/json"},
    )

    assert resp.status_code != 413


def test_upload_route_is_exempt_from_body_cap():
    client = build_client(rate_limit=30, rate_limit_expensive=30, window=60)

    oversized = b"x" * (SecurityMiddleware.MAX_BODY_BYTES * 3)
    resp = client.post(
        "/api/analyze/upload",
        content=oversized,
        headers={"content-type": "application/json"},
    )

    assert resp.status_code != 413


def test_get_requests_are_not_body_capped():
    client = build_client(rate_limit=30, rate_limit_expensive=30, window=60)

    assert client.get("/api/health").status_code == 200


# ---------------------------------------------------------------------------
# Access-code gate
# ---------------------------------------------------------------------------

def test_access_code_gate_rejects_missing_or_wrong_code():
    client = build_client(rate_limit=30, window=60, access_code="s3cret")

    assert client.post("/api/family/contacts", json={}).status_code == 401
    assert (
        client.post(
            "/api/family/contacts", json={}, headers={"x-access-code": "nope"}
        ).status_code
        == 401
    )


def test_access_code_gate_allows_correct_code():
    client = build_client(rate_limit=30, window=60, access_code="s3cret")

    resp = client.post(
        "/api/family/contacts", json={}, headers={"x-access-code": "s3cret"}
    )

    assert resp.status_code == 200


def test_access_code_gate_exempts_health_check():
    client = build_client(rate_limit=30, window=60, access_code="s3cret")

    assert client.get("/api/health").status_code == 200


def test_no_access_code_configured_keeps_endpoints_open():
    client = build_client(rate_limit=30, window=60, access_code="")

    assert client.post("/api/family/contacts", json={}).status_code == 200
