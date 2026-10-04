# 🚀 Quick Deployment — Live Call Monitor

Setelah pull perubahan terbaru (commit `1099cbe`), rebuild & restart:

```bash
cd /home/TamsyV/scamguard-ai

# Backend (STT + WebSocket perubahan)
sudo docker build -t scamguard-ai-backend:latest ./backend
sudo docker restart scamguard-backend scamguard-bot

# Frontend (LiveCallMonitor component baru)
sudo docker build -t scamguard-ai-frontend:latest ./frontend
sudo docker restart scamguard-frontend

# Verifikasi
curl https://api.parallel-dungeons.site/api/health
curl https://scamguard.parallel-dungeons.site
```

## Verifikasi Fitur Baru

```bash
# Backend: cek helper PCM baru ada
sudo docker exec scamguard-backend python3 -c "from app.audio.stt import pcm16_to_wav_bytes; print('✅')"

# Frontend: cek komponen baru
sudo docker exec scamguard-frontend ls src/components/LiveCallMonitor.tsx
```

## Manual Test WebSocket

```bash
# Install wscat (kalau belum ada)
npm install -g wscat

# Test WebSocket endpoint
wscat -c "wss://api.parallel-dungeons.site/api/analyze/stream"

# Kirim frame dummy (setelah connect):
{"seq":1,"audio_chunk":"AAAAAAAAAA=="}

# Expected: terima JSON response dengan "risk", "transcript_window", dll
```

## Browser Test (Cara Tercepat)

1. Buka: https://scamguard.parallel-dungeons.site
2. Klik tab: **📹 Live Call Monitor**
3. **Start Live Monitor** → allow camera/mic
4. Bicara: "Halo dari Bank BCA, sebutkan OTP sekarang juga"
5. Tunggu ~6 detik → transcript muncul + risk level naik

---

**Status saat ini**: Build sedang berjalan (background proc). ETA: 2-3 menit.
