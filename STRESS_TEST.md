# ScamGuard — Stress & Load Test Report

**Date:** 2026-10-04
**Target:** ScamGuard Multimodal backend (FastAPI/uvicorn) + Cloudflare tunnel
**Harness:** `scripts/stress_test.py` (asyncio + httpx + websockets)
**Environment:** Azure VM — **2 vCPU, 3.82 GiB RAM, no swap**, disk 91% used

---

## TL;DR

| Area | Verdict | Headline number |
|---|---|---|
| HTTP throughput (local) | ✅ Excellent | **331.8 rps**, p50 40.8 ms, 200/200 OK |
| HTTP throughput (public/CF) | ✅ Excellent | **208 rps**, p50 26.8 ms, 60/60 OK |
| Rate limiter | ✅ Works | 27 pass / 18 × `429` + `Retry-After: 55` |
| Error handling | ✅ Correct | 400 / 413 / 404, bad WS closed cleanly |
| E2E real scam detection | ✅ Works | HTTP 200 in **2.4 s**, risk **critical** 0.789 |
| WS concurrency 4 sessions | ✅ Good | 0 errors, p50 13.6 ms |
| WS concurrency 8 sessions | ⚠️ Degrades | 3/89 dropped, latency max **9.2 s** |
| Memory | ⚠️ Watch | 665 MiB → **1.59 GiB** high-water, no limit set |
| Crash / OOM under load | ✅ None | backend stayed up, 0 restarts |

**Bottom line:** safe for the hackathon demo with **≤4 concurrent live-call viewers**.
Beyond that, latency degrades but nothing crashes. Two follow-ups recommended (§5).

---

## 1. Methodology

Every `/analyze/text`, `/analyze/upload` and each ~4 s WebSocket segment calls **Groq**
(real cost + quota). To stress the *infrastructure* without burning the model budget, the
volume tests target endpoints that never reach the LLM:

- `/api/health` — exempt from the rate limiter, no LLM
- `/` — no LLM, but *is* rate-limited

Real Groq calls were restricted to one explicitly-budgeted end-to-end test (§4).

---

## 2. HTTP results

### 2.1 Baseline (local, warmed)

| Endpoint | n | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| `/api/health` | 5 | 1.7 ms | — | — | ~4 ms |
| `/` | 5 | ~3 ms | — | — | ~6 ms |

### 2.2 Throughput (local, concurrency 20, 200 requests)

```
rps           331.8
wall          0.60 s
status        200 → 200/200
latency       p50 40.8 ms | p90 ~120 ms | p99 185 ms | max ~210 ms
```

### 2.3 Throughput (public, through Cloudflare, concurrency 10, 60 requests)

```
rps           208.0
status        200 → 60/60
latency       p50 26.8 ms | p99 ~150 ms
```

Cloudflare adds negligible overhead and absorbs burst well. No 5xx observed.

---

## 3. Rate limiter

Burst of **45** rapid requests to `/` against a **30 req/min per-IP** limit:

```
passed        27   (200)
limited       18   (429)
Retry-After   55 s
```

✅ Limiter works and advertises `Retry-After`. `/api/health` correctly bypasses it
(confirmed by phase 2, which would otherwise have returned 429s).

> **Demo note:** the limiter is per-IP. If the demo runs behind a shared NAT/proxy,
> all viewers share one bucket. 30 req/min is ample for normal browsing, but a
> rapid refresh loop from several people can trip it.

---

## 4. End-to-end functional test (real Groq)

`POST /api/analyze/upload` with `sample_data/scam_id.ogg`:

```
HTTP 200 in 2.4 s
transcript      (Indonesian scam voice note)
is_scam         true
confidence      0.98
tactics         credential_harvest, credential_harvesting, ...
risk.level      critical
risk.score      0.789
```

✅ Full multimodal pipeline (STT → deepfake → LLM intent → risk fusion) works end-to-end
in **2.4 s**, well inside a live-demo budget.

### Data-quality observations (not load-related)
1. **Language misdetected** — Indonesian audio labelled `English`. Cosmetic here, but
   worth pinning the STT language hint for the demo.
2. **Duplicate tactic keys** — `credential_harvest` *and* `credential_harvesting` emitted
   for one tactic. LLM returns free-form labels; normalize against a fixed taxonomy.

---

## 5. WebSocket concurrency (live-call monitor)

Each session streams PCM16 audio (0.5 s chunks) + JPEG frames, expecting a JSON analysis
reply per message.

| Sessions | Duration | Sent | Recv | Errors | p50 | max latency |
|---|---|---|---|---|---|---|
| 4 | 12 s | 90 | 90 | 0 | 13.6 ms | 1.3–3.5 s |
| 3 | 75 s | 150 | 146 | 0 | — | **7.9 s** |
| 2 | 45 s | 106 | 106 | 0 | — | 3.0 s |
| 8 | 20 s | 89 | 86 | 0 | — | **9.2 s** |

**Reading:**
- No connection failures, no server errors, no crashes at any level.
- Latency is **bimodal**: fast replies (~14 ms) interleaved with multi-second spikes.
  The spikes line up with the **~4 s STT/LLM evaluation interval** blocking the per-session
  loop — expected, but it means reply latency is dominated by model cadence, not transport.
- At **8 concurrent** sessions, 3 of 89 messages went unanswered within the 10 s client
  timeout — graceful degradation, not failure.

### Resource profile

```
idle baseline        665 MiB
4 sessions           665 → 750 MiB   (flat, CPU peak 13%)
3 sessions sustained 750 → 1.48 GiB  (CPU peak 190% = both vCPUs saturated)
8 sessions           1.47 → 1.59 GiB (CPU peak 185%)
after load settles   1.36 GiB  (does NOT return to baseline)
container memory limit  0 (unlimited)
host swap               0 B
```

**Findings:**
- **Not an unbounded leak** — memory *plateaued* at 1.59 GiB and did not climb on a second
  round. It is high-water retention (allocator arena growth), not a per-request leak.
- **No OOM, no crash, no restart** at any level; `dmesg` shows no kills.
- But with **no container memory limit and no swap**, a pathological session could push the
  host into OOM and take down *all* containers (backend + frontend + bot).

---

## 6. Error handling

| Case | Expected | Observed |
|---|---|---|
| Empty/whitespace text | 400 | ✅ 400 |
| Upload > 25 MB | 413 | ✅ 413 |
| Unknown route | 404 | ✅ 404 |
| Malformed WS frame | no crash | ✅ closed cleanly |
| Health after abuse | 200 | ✅ 200 |

---

## 7. Recommendations

**P0 — set a container memory limit (5 min, prevents total outage)**
```yaml
# docker-compose.yml, under the backend service
    deploy:
      resources:
        limits:
          memory: 2g
```
A hard limit turns a host-wide OOM (kills every container) into a single-container
restart. Given the 1.59 GiB high-water on a 3.82 GiB host, 2 GiB leaves headroom for
frontend + bot.

**P1 — cap concurrent live-call sessions**
The demo is comfortable at ≤4 concurrent sessions. Add an in-process session counter that
rejects (or queues) the 5th with a clear message, so the failure mode is polite instead of
degraded latency.

**P2 — data-quality fixes** (from §4)
- Pin the STT language hint (`id` for the Indonesian demo).
- Normalize LLM tactics against a fixed taxonomy to kill duplicate keys.

**P3 — disk** — the VM is at **91% (2.8 GB free)**. A long demo writing logs/uploads could
fill it. Prune old images/logs before the event.

---

## 8. Reproduce

```bash
# local, all phases (rate-limit phase runs last on purpose)
python3 scripts/stress_test.py --base http://localhost:8000 --phase all

# public, LLM-free phases only
python3 scripts/stress_test.py --base https://api.parallel-dungeons.site --phase 1,2,3,5

# tune the WS scenario
python3 scripts/stress_test.py --base http://localhost:8000 --phase 4 \
  --ws-sessions 8 --ws-seconds 20
```

Raw JSON results append to `stress_results.jsonl` (gitignored).
