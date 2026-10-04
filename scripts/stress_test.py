#!/usr/bin/env python3
"""
ScamGuard Multimodal — stress / load test.

Calibrated for a small VM (2 vCPU / ~4 GB RAM) and for a metered LLM backend.

QUOTA SAFETY
------------
`/analyze/text`, `/analyze/upload` and every ~4s WebSocket segment call Groq
(real money + rate limit). This script therefore routes the *volume* tests at
endpoints that never touch the LLM:
  * `/`            -> root info, no LLM  (still subject to the rate limiter)
  * `/api/health`  -> exempt from the rate limiter, no LLM
Real-LLM calls are limited to a small, explicitly-labelled budget.

Phases
------
  1  baseline      single request latency (health, root)
  2  throughput    high-concurrency load on LLM-free endpoints
  3  rate_limit    confirm the 30/min per-IP limiter returns 429 + Retry-After
  4  ws_concurrent N concurrent WebSocket sessions (silence PCM + JPEG frames)
  5  errors        malformed input handling (400 / 413 / bad WS frame)

Usage
-----
  python3 scripts/stress_test.py --base http://localhost:8000 --phase all
  python3 scripts/stress_test.py --base https://api.parallel-dungeons.site --phase 1,3

Output: JSON summary to stdout + appended to stress_results.jsonl
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field, asdict
from typing import Any

try:
    import httpx
except ImportError:
    print("need httpx:  pip install httpx", file=sys.stderr)
    sys.exit(2)

try:
    import websockets
except ImportError:
    websockets = None  # only needed for phase 4

RESULTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "stress_results.jsonl")


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def pct(values: list[float], p: float) -> float:
    """Simple percentile (nearest-rank)."""
    if not values:
        return 0.0
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round((p / 100.0) * len(s) + 0.5)) - 1))
    return s[k]


def summarize(latencies_ms: list[float]) -> dict[str, float]:
    if not latencies_ms:
        return {"n": 0}
    return {
        "n": len(latencies_ms),
        "min_ms": round(min(latencies_ms), 1),
        "p50_ms": round(pct(latencies_ms, 50), 1),
        "p90_ms": round(pct(latencies_ms, 90), 1),
        "p99_ms": round(pct(latencies_ms, 99), 1),
        "max_ms": round(max(latencies_ms), 1),
        "mean_ms": round(statistics.fmean(latencies_ms), 1),
    }


@dataclass
class PhaseResult:
    phase: str
    ok: bool = True
    detail: dict[str, Any] = field(default_factory=dict)


# ----------------------------------------------------------------------------
# phase 1 — baseline latency
# ----------------------------------------------------------------------------
async def phase_baseline(base: str, n: int = 5) -> PhaseResult:
    out: dict[str, Any] = {}
    async with httpx.AsyncClient(base_url=base, timeout=30.0) as c:
        for path in ("/api/health", "/"):
            lat: list[float] = []
            codes: list[int] = []
            for _ in range(n):
                t0 = time.perf_counter()
                try:
                    r = await c.get(path)
                    codes.append(r.status_code)
                except Exception as e:
                    codes.append(-1)
                    out[f"{path}_error"] = f"{type(e).__name__}: {e}"
                lat.append((time.perf_counter() - t0) * 1000)
            out[path] = summarize(lat)
            out[f"{path}_codes"] = codes
    return PhaseResult("baseline", True, out)


# ----------------------------------------------------------------------------
# phase 2 — throughput on LLM-free endpoints
# ----------------------------------------------------------------------------
async def phase_throughput(base: str, concurrency: int = 20, total: int = 200) -> PhaseResult:
    """Pure server throughput. Uses /api/health only — it is exempt from the
    rate limiter, so we measure the ASGI server, not the 429 path."""
    lat: list[float] = []
    codes: list[int] = []
    lock = asyncio.Lock()
    sem = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(base_url=base, timeout=30.0) as c:
        async def one(i: int):
            async with sem:
                t0 = time.perf_counter()
                try:
                    r = await c.get("/api/health")
                    code = r.status_code
                except Exception:
                    code = -1
                dt = (time.perf_counter() - t0) * 1000
                async with lock:
                    lat.append(dt)
                    codes.append(code)

        t0 = time.perf_counter()
        await asyncio.gather(*(one(i) for i in range(total)))
        wall = time.perf_counter() - t0

    from collections import Counter
    return PhaseResult("throughput", True, {
        "concurrency": concurrency,
        "total": total,
        "wall_s": round(wall, 2),
        "rps": round(total / wall, 1) if wall > 0 else 0,
        "status_counts": dict(Counter(codes)),
        "latency": summarize(lat),
        "note": "/api/health is exempt from the rate limiter",
    })


# ----------------------------------------------------------------------------
# phase 3 — rate limiter
# ----------------------------------------------------------------------------
async def phase_rate_limit(base: str, burst: int = 45) -> PhaseResult:
    """Fire a burst at '/' (no LLM). Expect ~limit passes, remainder 429."""
    codes: list[int] = []
    retry_after: list[str] = []
    async with httpx.AsyncClient(base_url=base, timeout=30.0) as c:
        for _ in range(burst):
            try:
                r = await c.get("/")
                codes.append(r.status_code)
                if r.status_code == 429:
                    retry_after.append(r.headers.get("retry-after", ""))
            except Exception:
                codes.append(-1)
    from collections import Counter
    counts = Counter(codes)
    limited = counts.get(429, 0)
    return PhaseResult("rate_limit", limited > 0, {
        "burst": burst,
        "status_counts": dict(counts),
        "saw_429": limited > 0,
        "retry_after_values": sorted(set(retry_after)),
        "note": "429 = limiter working; 0 means limit not reached from this IP",
    })


# ----------------------------------------------------------------------------
# phase 4 — concurrent WebSocket sessions
# ----------------------------------------------------------------------------
def _silence_pcm(chunk_bytes: int = 32000) -> str:
    """Low-amplitude noise PCM16 LE — non-speech, keeps STT cheap/empty."""
    import random
    samples = bytearray()
    for _ in range(chunk_bytes // 2):
        v = random.randint(-40, 40)
        samples += int(v).to_bytes(2, "little", signed=True)
    return base64.b64encode(bytes(samples)).decode()


def _dummy_jpeg_b64() -> str:
    # minimal valid-ish JPEG header/footer
    raw = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
    return base64.b64encode(raw).decode()


async def _one_ws_session(uri: str, seconds: float, seq_base: int) -> dict[str, Any]:
    if websockets is None:
        return {"error": "websockets not installed"}
    audio = _silence_pcm()
    frame = _dummy_jpeg_b64()
    sent = 0
    recvd = 0
    lat: list[float] = []
    err: str | None = None
    try:
        async with websockets.connect(uri, open_timeout=15, close_timeout=5) as ws:
            deadline = time.time() + seconds
            seq = seq_base
            while time.time() < deadline:
                seq += 1
                payload = json.dumps({"seq": seq, "audio_chunk": audio, "video_frame": frame})
                t0 = time.perf_counter()
                await ws.send(payload)
                sent += 1
                try:
                    await asyncio.wait_for(ws.recv(), timeout=10)
                    recvd += 1
                    lat.append((time.perf_counter() - t0) * 1000)
                except asyncio.TimeoutError:
                    pass
                await asyncio.sleep(0.5)  # ~2 msg/s per session
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    return {
        "sent": sent, "recvd": recvd, "error": err,
        "latency": summarize(lat) if lat else {"n": 0},
    }


async def phase_ws_concurrent(base: str, sessions: int = 4, seconds: float = 12.0) -> PhaseResult:
    ws_base = base.replace("http://", "ws://").replace("https://", "wss://")
    uri = ws_base.rstrip("/") + "/api/analyze/stream"
    t0 = time.perf_counter()
    results = await asyncio.gather(
        *(_one_ws_session(uri, seconds, i * 10000) for i in range(sessions)),
        return_exceptions=True,
    )
    wall = time.perf_counter() - t0
    norm: list[dict[str, Any]] = []
    for r in results:
        if isinstance(r, BaseException):
            norm.append({"error": f"{type(r).__name__}: {r}"})
        else:
            norm.append(r)
    total_sent = sum(r.get("sent", 0) for r in norm)
    total_recvd = sum(r.get("recvd", 0) for r in norm)
    all_lat = [r["latency"]["p50_ms"] for r in norm if r.get("latency", {}).get("n")]
    return PhaseResult("ws_concurrent", total_recvd > 0, {
        "uri": uri,
        "sessions": sessions,
        "seconds_each": seconds,
        "wall_s": round(wall, 2),
        "total_sent": total_sent,
        "total_recvd": total_recvd,
        "sessions_detail": norm,
        "median_of_session_p50_ms": round(statistics.fmean(all_lat), 1) if all_lat else None,
    })


# ----------------------------------------------------------------------------
# phase 5 — error handling (LLM-free: all rejected before the model)
# ----------------------------------------------------------------------------
async def phase_errors(base: str) -> PhaseResult:
    checks: dict[str, Any] = {}
    async with httpx.AsyncClient(base_url=base, timeout=60.0) as c:
        # empty text -> 400 (rejected before LLM)
        try:
            r = await c.post("/api/analyze/text", json={"text": "   "})
            checks["empty_text"] = {"status": r.status_code, "expect": 400}
        except Exception as e:
            checks["empty_text"] = {"error": str(e)}

        # oversized upload -> 413 (content-length gate, no body read)
        try:
            big = b"\x00" * (26 * 1024 * 1024)
            r = await c.post("/api/analyze/upload", files={"file": ("big.wav", big, "audio/wav")})
            checks["oversized_upload"] = {"status": r.status_code, "expect": 413}
        except Exception as e:
            checks["oversized_upload"] = {"error": f"{type(e).__name__}: {e}"}

        # unknown route -> 404
        try:
            r = await c.get("/api/does-not-exist")
            checks["unknown_route"] = {"status": r.status_code, "expect": 404}
        except Exception as e:
            checks["unknown_route"] = {"error": str(e)}

    # malformed WS frame -> server should not crash
    if websockets is not None:
        ws_base = base.replace("http://", "ws://").replace("https://", "wss://")
        uri = ws_base.rstrip("/") + "/api/analyze/stream"
        try:
            async with websockets.connect(uri, open_timeout=15) as ws:
                await ws.send("this is not json {{{")
                try:
                    await asyncio.wait_for(ws.recv(), timeout=8)
                    checks["malformed_ws"] = {"handled": "response"}
                except asyncio.TimeoutError:
                    checks["malformed_ws"] = {"handled": "silent"}
                except Exception as e:
                    checks["malformed_ws"] = {"handled": f"{type(e).__name__}"}
        except Exception as e:
            checks["malformed_ws"] = {"error": f"{type(e).__name__}: {e}"}

        # health after abuse -> still alive?
        async with httpx.AsyncClient(base_url=base, timeout=15.0) as c:
            try:
                r = await c.get("/api/health")
                checks["health_after_abuse"] = {"status": r.status_code, "expect": 200}
            except Exception as e:
                checks["health_after_abuse"] = {"error": str(e)}

    passed = all(
        (v.get("status") == v.get("expect")) or ("handled" in v)
        for v in checks.values()
        if isinstance(v, dict)
    )
    return PhaseResult("errors", passed, checks)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
PHASES = {
    "1": ("baseline", phase_baseline),
    "2": ("throughput", phase_throughput),
    "3": ("rate_limit", phase_rate_limit),
    "4": ("ws_concurrent", phase_ws_concurrent),
    "5": ("errors", phase_errors),
}


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--phase", default="all", help="all | comma list e.g. 1,3")
    ap.add_argument("--ws-sessions", type=int, default=4)
    ap.add_argument("--ws-seconds", type=float, default=12.0)
    ap.add_argument("--throughput-conc", type=int, default=20)
    ap.add_argument("--throughput-total", type=int, default=200)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    wanted = list(PHASES) if args.phase == "all" else [p.strip() for p in args.phase.split(",") if p.strip()]

    run = {"base": args.base, "started": time.strftime("%Y-%m-%dT%H:%M:%S"), "results": []}
    print(f"\n=== ScamGuard stress test -> {args.base} ===\n")

    for key in wanted:
        if key not in PHASES:
            print(f"  unknown phase '{key}', skipping")
            continue
        name, fn = PHASES[key]
        print(f"[phase {key}] {name} ...", flush=True)
        t0 = time.perf_counter()
        try:
            if name == "throughput":
                res = await fn(args.base, args.throughput_conc, args.throughput_total)
            elif name == "ws_concurrent":
                res = await fn(args.base, args.ws_sessions, args.ws_seconds)
            else:
                res = await fn(args.base)
        except Exception as e:
            res = PhaseResult(name, False, {"exception": f"{type(e).__name__}: {e}"})
        res.detail["elapsed_s"] = round(time.perf_counter() - t0, 2)
        run["results"].append(asdict(res))
        status = "OK " if res.ok else "FAIL"
        print(f"   -> {status} ({res.detail['elapsed_s']}s)")
        print(json.dumps(res.detail, indent=2)[:2000])
        print()

    run["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")

    if not args.no_write:
        path = os.path.abspath(RESULTS_PATH)
        with open(path, "a") as f:
            f.write(json.dumps(run) + "\n")
        print(f"appended -> {path}")

    return 0 if all(r["ok"] for r in run["results"]) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
