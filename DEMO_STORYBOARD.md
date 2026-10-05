# Demo Storyboard — ScamGuard (Hackathon)

Complete guide for recording the hackathon demo video. Three calibrated English scenarios, one click each.

---

## Objective (60 seconds)

1. **Problem**: Seniors fall victim to coercive calls — authority impersonation, OTP theft, ransom demands.
2. **Solution**: ScamGuard detects coercive language patterns plus real-time audio/video signals.
3. **Proof**: 3 calibrated scenarios → `low` / `high` / `critical` risks with named tactics.
4. **Close**: FamilyGuard provides a response script + Verification Ping to the Trust Circle.

---

## Scene 1 — Landing & Access Gate (5s)

**Narration**: "ScamGuard is a multimodal AI-powered scam detector."

**On screen**:
- Open `https://scamguard.parallel-dungeons.site`
- If `ACCESS_CODE` is set: access code modal appears → type code → continue.
- `Demo protected` badge visible in navbar.

**Note**: Do not show the access code in the video. Type fast, blur if needed.

---

## Scene 2 — CLEAN scenario (10s)

**Narration**: "First, a normal call — no pressure, no money request."

**On screen**:
1. Scroll to **Demo Scenarios**.
2. Click **Clean — Meeting reminder**.
3. Auto-scrolls to ScamChecker, textarea fills with the office message.
4. Click **Analyze Text**.
5. Wait for result (~2s).

**Expected output** (verified against live backend):
```
risk_level: low
risk.score:  ~0.0
tactics_detected: []
recommendation: "Call appears normal. No action needed."
```

**Visual**: emerald green card, `LOW RISK` badge, short green bar, empty "Detected indicators" section.

---

## Scene 3 — SUSPICIOUS scenario (15s)

**Narration**: "Now, a fake prize offer asking for bank details. Watch the tactics light up."

**On screen**:
1. Back to Demo Scenarios.
2. Click **Suspicious — Prize lure asking for bank account**.
3. Click **Analyze Text**.

**Expected output** (verified against live backend):
```
risk_level: critical
risk.score:  ~0.78
tactics_detected: ["financial_demand", "unsolicited_prize", "urgency"]
```

**Visual**: red-orange card, `HIGH/CRITICAL RISK` badge, tactic cards:
- ⏱ Urgency pressure
- 💰 Financial demand
- 🎁 Prize lure
- 🔑 Credential harvesting

**Recommendation card**: "End the conversation. Verify through the official number."

---

## Scene 4 — CRITICAL scenario (20s) ⭐ CLIMAX

**Narration**: "Most important — the classic authority scam: fake police officer, urgency pressure, demanding an OTP."

**On screen**:
1. Click **Critical — Police impersonation + ransom + OTP demand**.
2. Click **Analyze Text**.
3. Highlight each tactic as it appears.
4. Scroll down → show **FamilyGuard** guidance.
5. Show **Verification Ping** flow (if Trust Circle is set up).

**Expected output** (verified against live backend):
```
risk_level: critical
risk.score:  ~0.79
tactics_detected: [
  "authority_impersonation",
  "coercive_isolation",
  "credential_harvest",
  "family_emergency",
  "financial_demand",
  "urgency"
]
recommendation: "End the conversation, contact the institution via the official number."
```

**Visual**: red card, `DANGEROUS` badge, tactic cards, green FamilyGuard banner.

---

## Scene 5 — Feedback Loop & Trust Circle (10s)

**Narration**: "Every report lands in the feedback panel. A moderator can accept or reject. Accepted reports automatically trigger a ping to the Trust Circle — 15-minute TTL."

**On screen**:
1. Scroll to **Feedback Panel**.
2. Show `pending` report list.
3. Click **Accept** on one report.
4. Status changes → `accepted`.
5. Screenshot Telegram ping (if configured).

---

## Flow Overview

```
Landing (Access Gate)
   ↓
Demo Scenarios (3 cards)
   ↓ [click card]
ScamChecker (textarea auto-fills)
   ↓ [Analyze]
Result: Risk Level + Tactics + FamilyGuard
   ↓ [pick next scenario]
Feedback Panel → accept → Telegram ping → Trust Circle
```

---

## Full Voice-Over Script (~55s)

> "Seniors lose millions to phone scams every year. ScamGuard detects them before they strike.
>
> **First** — a normal office call. ScamGuard says: low risk, no tactics detected. All clear.
>
> **Second** — a prize offer of two thousand dollars, asking for your bank account before a deadline. ScamGuard flags financial demand, prize lure, and urgency.
>
> **Third** — someone claiming to be the police, saying your child had an accident, demanding fifty thousand dollars and an OTP. Authority impersonation, coercive isolation, credential harvesting light up. Risk critical. FamilyGuard gives you a script: end the call, contact the police via the official number.
>
> Every report can be verified with the Trust Circle within a 15-minute TTL.
>
> ScamGuard. Protect your family from scams. Thank you."

---

## Recording Tips

- **Resolution**: 1080p, Chrome fullscreen, zoom 100%.
- **Audio**: narration helps a lot. Record with a headset.
- **Language toggle**: keep the UI on **English** for the whole video.
- **Timing**: Scene 2→3→4 back-to-back, no cuts between Analyze clicks (shows real latency).
- **Blur**: access code, any real phone numbers, Telegram chat IDs.

---

## Troubleshooting Recording

| Issue | Fix |
|---|---|
| Access code appears | Type fast off-frame, or temporarily set `ACCESS_CODE=` (empty) |
| Slow loading | Pre-warm: click Analyze 1x before recording starts |
| Empty transcript | Scenarios are text-only, so safe |
| FamilyGuard missing | Backend must be healthy: `curl https://api.parallel-dungeons.site/api/health` |
| Telegram ping missing | Bot polling mode OK; verify Trust Circle setup |

---

## Export Checklist

- [ ] Recording MP4 (1080p, H.264)
- [ ] Thumbnail (frame from Scene 4 — red card)
- [ ] English subtitles (hardcode in CapCut)
- [ ] Upload YouTube (unlisted) → embed in README
- [ ] Upload to Google Drive as backup

---

## Quick Verification Script

```bash
# Make sure the live site is ready before recording
curl -s -o /dev/null -w "frontend: %{http_code}\n" https://scamguard.parallel-dungeons.site
curl -s -o /dev/null -w "api: %{http_code}\n" https://api.parallel-dungeons.site/api/health
```

**Ready to record!** 🚀
