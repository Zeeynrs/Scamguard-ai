# 🎥 Live Video Call Monitor — Demo Guide

## Fitur Baru: Real-Time Scam Detection saat Video Call

**Target**: Deteksi deepfake + scam language **saat live video call** (bukan hanya analisis file).

### Cara Kerja Teknis

```
Browser Kamera/Mic → WebSocket → Backend (Vision + STT + Intent) → Risk Score Real-Time
```

1. **Frontend** (React):
   - Capture mic → PCM16 LE 16kHz mono (0.5s chunks) → base64 → WebSocket
   - Capture video → 1 frame/s JPEG → base64 → WebSocket
   - Terima risk score & transcript real-time, overlay di video

2. **Backend** (FastAPI WebSocket):
   - Audio: buffer PCM → setiap 4s, transkrip segmen 3s baru (Groq Whisper)
   - Transcript **akumulatif** (tidak overlap → hemat kuota Groq)
   - Vision: MediaPipe face mesh → blink rate, jitter (deepfake indicators)
   - Intent: re-analyze cumulative transcript → detect scam tactics
   - Fusion → risk score → emit JSON ke client

### Cara Tes (Manual)

1. **Buka**: https://scamguard.parallel-dungeons.site
2. **Klik tab**: 📹 **Live Call Monitor**
3. **Start Live Monitor** → browser minta izin kamera/mic → **Allow**
4. **Video preview** muncul dengan overlay risk level (kanan atas)
5. **Bicara** kata-kata scam (contoh):
   - "Halo dari Bank BCA, ada transaksi mencurigakan"
   - "Sebutkan kode OTP sekarang juga atau rekening diblokir"
   - "Transfer 5 juta dalam 10 menit, jangan tutup telepon"

6. **Lihat**:
   - Transcript muncul **live** di bawah video (sekitar 4-6 detik delay)
   - **Risk level** naik dari LOW → MEDIUM/HIGH/CRITICAL
   - **Risk score** berubah real-time
   - **Recommendation** muncul

7. **Stop** → kamera/mic dimatikan, WebSocket ditutup

---

## Demo untuk Juri Hackathon

### Skenario A: Scam Call Simulation (1 orang)

Kamu di depan kamera, **ngomong seolah-olah lagi telpon dengan scammer**:

> "Halo Pak, saya dari Bank Mandiri cyber security team. Kami deteksi ada transaksi mencurigakan 15 juta rupiah. Untuk mengamankan akun Bapak, sebutkan kode OTP yang baru kami kirim. Jangan tutup telepon, proses ini butuh verifikasi segera."

**Expected**:
- Transcript muncul (Groq Whisper large-v3 akurat untuk ID/EN)
- Tactics: `urgency`, `authority_impersonation`, `credential_harvest`, `isolation_tactic`
- Risk: **CRITICAL** (0.7-0.9)
- Overlay video: border merah, "CRITICAL"

### Skenario B: Normal Conversation

> "Hi, how was your weekend? I went hiking with friends. The weather was great."

**Expected**:
- Transcript muncul
- Risk: **LOW** (0.0-0.1)
- Overlay: hijau, "LOW"

### Skenario C: Mixed Language (Code-Switching)

> "Hello, saya mau confirm payment 500 ribu for the event ticket. Bisa transfer sekarang?"

**Expected**:
- Transcript akurat (Whisper handle code-switching)
- Risk: LOW-MEDIUM (karena ada "payment" + "transfer sekarang" tapi tidak coercive)

---

## Keunggulan vs Kompetitor

| Fitur | ScamGuard | Kompetitor Biasa |
|---|---|---|
| **Live video call analysis** | ✅ Real-time | ❌ Hanya file upload |
| **Multimodal fusion** | ✅ Vision + Audio + Intent | ❌ Biasanya teks saja |
| **Bahasa Indonesia** | ✅ Native (Whisper large-v3) | ❌ Akurasi buruk |
| **Deepfake detection** | ✅ Audio + Video (MediaPipe) | ❌ Tidak ada |
| **No API key dari user** | ✅ Backend handle | ❌ User bawa key sendiri |

---

## Troubleshooting

### Kamera/Mic tidak muncul

- **Chrome/Edge**: Settings → Privacy → Camera/Microphone → Allow scamguard.parallel-dungeons.site
- **Firefox**: Click padlock → Permissions → Allow Camera & Microphone
- **Safari** (iOS/Mac): Settings → Safari → Camera & Microphone → Allow

### WebSocket error / Connection failed

```bash
# Cek backend WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" \
  https://api.parallel-dungeons.site/api/analyze/stream
# Expected: HTTP 426 Upgrade Required (artinya endpoint ada, tapi perlu real WebSocket handshake)
```

### Transcript tidak muncul

- **Audio terlalu pelan**: bicara lebih dekat ke mic
- **Kuota Groq habis**: fallback ke Whisper lokal (lebih lambat, tapi tetap jalan)
- **Backend log**: 
  ```bash
  sudo docker logs -f scamguard-backend | grep -i "stream\|stt\|groq"
  ```

### Risk level tidak berubah

- **Transcript masih kosong**: tunggu 4-6 detik pertama (buffer STT)
- **Kata-kata tidak scam**: coba skenario A di atas
- **Intent LLM gagal**: cek log backend, Groq API key valid?

---

## Metrics untuk Pitch

- **Latency**: ~4-6 detik STT (Groq), ~1 fps video (hemat bandwidth)
- **Akurasi Whisper**: large-v3 (best for Indonesian, tested vs base/small)
- **Kuota**: transkrip inkremental (tidak overlap) → 1 menit call = ~20 segmen = ~20 Groq calls
- **Bandwidth**: audio PCM 16kHz mono = ~32 KB/s, video 1 fps JPEG ~10-20 KB/s = **~50 KB/s total**

---

## Next Steps (Opsional, kalau ada waktu)

1. **Video demo 30 detik**: record live call monitor → edit → upload ke YouTube → embed di README
2. **Pitch deck** (5-7 slide):
   - Problem: scam calls naik 300% (source: statistik nyata)
   - Solution: real-time multimodal detection
   - Demo: screenshot live call monitor
   - Tech: Groq LLM+STT, MediaPipe, FastAPI WebSocket
   - Impact: lindungi orang tua, korban scam
3. **Diagram arsitektur**: draw.io atau Mermaid
4. **Load test**: berapa concurrent WebSocket bisa handle? (gunakan `locust` atau manual with `wscat`)

---

**Sekarang siap untuk demo! 🚀**
