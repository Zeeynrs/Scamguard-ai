# ScamGuard Multimodal

Real-time defense against AI-powered voice & video call scams.

Detects **deepfake voice**, **deepfake face**, and **social-engineering intent** during a live or recorded call, and shows a single risk score with a transparent breakdown of *why* it fired.

## Why

Modern fraud has moved to **live multimodal impersonation**: AI voice cloning (ElevenLabs, RVC), real-time face swap (FaceFusion, Deep-Live-Cam), combined with aggressive social engineering — fake kidnapping, fake CEO/vendor transfers, fake bank verification. Victims have no verification tool while the call is still running.

ScamGuard gives them one.

## How — three detection layers

| Layer | Signal | Method |
|---|---|---|
| **Vision** | Face swap artifacts | MediaPipe FaceMesh — blink anomaly (EAR), temporal landmark jitter, face-boundary inconsistency |
| **Audio** | Synthetic speech artifacts | Spectral / acoustic artifact scoring (AASIST-style) on 2–3 s chunks |
| **Intent** | Scam tactics in speech | Regex trigger engine + LLM tactic classifier (Indonesian + English) |

The three scores fuse into one **cumulative risk score (0–100%)**:

- **0–39%** — Safe (green)
- **40–69%** — Caution (yellow): anomalous audio/video signal *or* urgent-pressure language
- **70–100%** — Critical (red): strong deepfake indication *and* financial/coercive demand

Every alert ships a **forensic breakdown** — the exact signals that fired (e.g. *"unnatural blink rate"* + *"transfer request under time pressure"*).

## Honest limitations

We do **not** claim perfect detection. On clean studio audio, SOTA detectors reach ~95–99%; on **telephone-band** audio (8 kHz, lossy codec) accuracy collapses, and on **unseen TTS generators** it degrades further. Audio deepfake scoring is presented as an **indication, not proof**. The intent layer is the more reliable signal and is weighted accordingly.

## Two operating modes

1. **Live stream** (WebRTC / browser feed) — processes video + mic while the call runs.
2. **Upload / voice note** — full forensic analysis of a recorded call or voice message.

## Repo layout

```
scamguard-ai/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + WebSocket
│   │   ├── config.py         # Settings (env-driven)
│   │   ├── core/
│   │   │   ├── schemas.py    # Pydantic models
│   │   │   └── fusion.py     # Risk fusion engine
│   │   ├── audio/
│   │   │   ├── stt.py        # faster-whisper transcription (ID/EN)
│   │   │   └── deepfake.py   # audio deepfake scorer
│   │   ├── vision/
│   │   │   └── analyzer.py   # MediaPipe face / blink / jitter
│   │   ├── intent/
│   │   │   ├── rules.py      # regex scam-tactic matcher (ID + EN)
│   │   │   └── llm.py        # LLM tactic classifier
│   │   └── api/
│   │       └── routes.py     # REST + WS endpoints
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # Live call HUD (Next.js)
├── sample_data/              # real vs deepfake fixtures
├── docker-compose.yml
└── .env.example
```

## Quick start

```bash
cp .env.example .env          # add your OPENAI_API_KEY
docker compose up --build     # backend on :8000
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

### Live stream

Connect to `ws://localhost:8000/api/analyze/stream` and send audio/video frames; receive rolling risk updates.

## Status

Built for a 6-day hackathon. Layer-by-layer progress tracked in `docs/ROADMAP.md`.

## License

MIT — see `LICENSE`.
