# ScamGuard Multimodal

Real-time defense against AI-powered voice & video call scams — built for a 7-day hackathon.

Detects **deepfake voice**, **deepfake face**, and **social-engineering intent** during a live or recorded call, shows a single risk score with a transparent breakdown of *why* it fired, and adds a **Family Protection** layer that lets you verify who is really calling.

---

## Why

Modern fraud has moved to **live multimodal impersonation**: AI voice cloning (ElevenLabs, RVC), real-time face swap (FaceFusion, Deep-Live-Cam), combined with aggressive social engineering — fake kidnapping, fake CEO/vendor transfers, fake bank verification. Victims have no verification tool while the call is still running.

ScamGuard gives them one.

## How — Four Detection Layers

| Layer | Signal | Method |
|---|---|---|
| **Vision** | Face swap artifacts | MediaPipe FaceMesh — blink anomaly (EAR), temporal landmark jitter, face-boundary inconsistency |
| **Audio** | Synthetic speech artifacts | Spectral / acoustic artifact scoring (AASIST-style) on 2–3 s chunks |
| **Intent** | Scam tactics in speech | Regex trigger engine + LLM tactic classifier (Indonesian + English) |
| **Family** | Caller identity | Safe-word + Trust Circle verification pings — PBKDF2-protected, multi-tenant isolation |

The three deepfake/signal scores fuse into one **cumulative risk score (0–100%)**:

- **0–39%** — Safe (green)
- **40–69%** — Caution (yellow): anomalous audio/video signal *or* urgent-pressure language
- **70–100%** — Critical (red): strong deepfake indication *and* financial/coercive demand

Every alert ships a **forensic breakdown** — the exact signals that fired (e.g. *“unnatural blink rate”* + *“transfer request under time pressure”*).

---

## Honest Limitations

We do **not** claim perfect detection. On clean studio audio, SOTA detectors reach ~95–99%; on **telephone-band** audio (8 kHz, lossy codec) accuracy collapses, and on **unseen TTS generators** it degrades further. Audio deepfake scoring is presented as an **indication, not proof**. The intent layer is the more reliable signal and is weighted accordingly.

Intent engine benchmarks (bilingual, 20 samples):

| Language | Precision | Recall | F1 |
|---|---|---|---|
| Indonesian | 100% | 100% | 100% |
| English | 80% | 80% | 80% |
| **Overall** | **90%** | **90%** | **90%** |

---

## Two Operating Modes

1. **Live stream** (WebRTC / browser feed) — processes video + mic while the call runs.
2. **Upload / voice note** — full forensic analysis of a recorded call or voice message.

---

## Family Protection Layer

A Trust Circle lets family members cross-verify identity before acting on a suspicious request.

| Feature | Detail |
|---|---|
| **Safe Word** | Stored as PBKDF2 HMAC-SHA256 (600k iterations, random 16-byte salt). Plaintext never persisted. |
| **Trust Circle Contacts** | Each family identified by `X-Family-Owner` header. Contact names stored per-owner; cross-tenant isolation enforced. |
| **Verification Ping** | When a claim arrives, the system pings Trust Circle contacts. Contacts receive a Telegram notification (best-effort). |
| **TTL Auto-expiry** | Pings expire after configurable TTL (default 3600 s). Expired pings cannot be answered. |
| **Multi-tenant Isolation** | Owner A cannot read, respond, or delete owner B's data. Validated with 55+ automated tests. |

### Security Hardening

- Tiered rate limiting: 10 requests/min on `/api/analyze/*` (LLM-heavy), 30 requests/min elsewhere
- Request body cap: 100 KB on non-upload endpoints (verified with 200 KB payload → 413)
- Access code via `X-Access-Code` header (configurable; empty = open demo)
- Tiered pricing indicator (`X-Rate-Limit-Remaining` + `Retry-After` headers on 429)

---

## Feedback & Learning Loop

Users can report false positives / false negatives via `POST /api/feedback`. Each report is anti-spam-protected (1 pending per excerpt per hour, 280 char max). Moderators accept or reject via:

```
POST /api/feedback/{id}/moderate   body: { "status": "accepted" | "rejected" }
```

Accepted corrections feed future model calibration. The **Feedback Panel** at the bottom of the web UI lets moderators review, accept, or reject reports in real-time.

---

## Repo Layout

```
scamguard-ai/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app + WebSocket
│   │   ├── config.py             # Settings (env-driven)
│   │   ├── core/
│   │   │   ├── schemas.py        # Pydantic models
│   │   │   ├── fusion.py         # Risk fusion engine
│   │   │   └── security.py       # Rate limiting + body cap middleware
│   │   ├── audio/
│   │   │   ├── stt.py            # faster-whisper transcription (ID/EN)
│   │   │   └── deepfake.py       # Audio deepfake scorer
│   │   ├── vision/
│   │   │   └── analyzer.py       # MediaPipe face / blink / jitter
│   │   ├── intent/
│   │   │   ├── rules.py          # Regex scam-tactic matcher (ID + EN)
│   │   │   ├── llm.py            # LLM tactic classifier
│   │   │   └── eval.py           # Bilingual benchmark evaluator
│   │   ├── safety/
│   │   │   ├── db.py             # SQLite WAL + PBKDF2 hashing
│   │   │   ├── store.py          # FamilyStore: contacts, pings, feedback
│   │   │   ├── notify.py         # Telegram ping notifications
│   │   │   ├── safeword.py       # Challenge generation
│   │   │   └── scripts.py        # Guidance reply scripts
│   │   └── api/
│   │       └── routes.py         # REST + WS endpoints
│   ├── tests/
│   │   ├── test_security.py      # 18 tests: rate limit, body cap, access code
│   │   ├── test_safety.py        # 15 tests: safe word, contacts, pings, feedback
│   │   ├── test_persistence.py   # 14 tests: SQLite durability, owner isolation
│   │   ├── test_eval.py          # 3 tests: benchmark suite
│   │   └── test_notify.py        # 5 tests: Telegram notification dispatch
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/page.tsx          # Main page (Hero, Checker, Family Guard, Feedback)
│   │   └── components/
│   │       ├── ScamChecker.tsx   # Text/audio/video analysis UI
│   │       ├── FamilyGuard.tsx   # Trust Circle management + ping UI
│   │       ├── FeedbackPanel.tsx # Feedback moderation dashboard
│   │       └── ...
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Quick Start

```bash
cp .env.example .env          # add your API keys (GROQ_API_KEY recommended)
docker compose up --build     # backend :8000, frontend :3000
```

Manual (no docker):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Analyze a voice note

```bash
curl -X POST http://localhost:8000/api/analyze/upload \
  -F "file=@sample_data/scam_voice_id.ogg"
```

### Family Protection

```bash
# Set safe word
curl -X POST http://localhost:8000/api/family/safe-word \
  -H "X-Family-Owner: keluarga-budi" \
  -H "Content-Type: application/json" \
  -d '{"safe_word": "melati"}'

# Verify
curl -X POST http://localhost:8000/api/family/safe-word/verify \
  -H "X-Family-Owner: keluarga-budi" \
  -H "Content-Type: application/json" \
  -d '{"answer": "melati"}'
# → {"passed": true}

# Add Trust Circle contact
curl -X POST http://localhost:8000/api/family/contacts \
  -H "X-Family-Owner: keluarga-budi" \
  -H "Content-Type: application/json" \
  -d '{"name": "Ayah", "telegram_username": "@ayah"}'

# Trigger verification ping
curl -X POST http://localhost:8000/api/family/pings \
  -H "X-Family-Owner: keluarga-budi" \
  -H "Content-Type: application/json" \
  -d '{"claim": "Anak kecelakaan, minta tebusan sekarang"}'
# → contact @ayah receives Telegram notification
```

### Submit feedback (false positive correction)

```bash
curl -X POST http://localhost:8000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"excerpt": "halo apa kabar", "is_scam": true, "comment": "benar-benar bukan scam"}'
```

### Live stream

Connect to `ws://localhost:8000/api/analyze/stream` and send audio/video frames; receive rolling risk updates.

---

## Test Suite

```bash
# Inside backend container
docker exec scamguard-backend python -m pytest tests/ -q
# → 55 passed
```

Tests cover:
- **Security** (18): rate limit tier enforcement, body cap, access code, IP extraction
- **Safety** (15): PBKDF2 hashing, contacts CRUD, ping TTL, feedback anti-spam, owner isolation
- **Persistence** (14): SQLite WAL, durable storage, API-level owner header enforcement
- **Eval** (3): bilingual benchmark runner, baseline threshold check
- **Notify** (5): Telegram dispatch no-op, thread start, contact handle filtering

---

## Deployment

Live at:
- **Frontend:** https://scamguard.parallel-dungeons.site
- **API:** https://api.parallel-dungeons.site

```
docker compose up -d            # start all services
docker compose build --no-cache # rebuild after code changes
```

Environment variables: see `.env.example` or `backend/app/config.py` for full list.

---

## Status

Built in 7 days. Layer-by-layer progress tracked in commit history.

**Current:** 55 tests passing. Family Protection multi-tenant. Feedback loop with moderation dashboard. Telegram ping notifications. Bilingual (ID + EN) intent detection.

---

## License

MIT — see `LICENSE`.