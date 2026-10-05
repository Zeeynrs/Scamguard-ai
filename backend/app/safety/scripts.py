"""Reply-script engine: what to SAY, what NOT to do, and why (ID/EN)."""
from typing import Dict, List

_SCRIPTS: Dict[str, Dict[str, Dict[str, str]]] = {
    "family_emergency": {
        "id": {
            "title": "Darurat keluarga — verifikasi dulu",
            "say": "Aku bantu, tapi kita punya kata sandi keluarga. Sebutkan dulu.",
            "avoid": "Jangan transfer uang atau ikuti instruksi sebelum kata sandi benar.",
            "why": "Penipu memakai suara AI anggota keluarga untuk memicu panik. Kata sandi keluarga tidak bisa mereka tebak.",
        },
        "en": {
            "title": "Family emergency — verify first",
            "say": "I'll help, but we have a family safe word. Tell it to me first.",
            "avoid": "Do not transfer money or follow instructions until the safe word checks out.",
            "why": "Scammers clone a relative's voice to trigger panic. A family safe word is something they cannot guess.",
        },
    },
    "urgency": {
        "id": {
            "title": "Tekanan waktu",
            "say": "Saya tidak bisa memutuskan sekarang. Saya akan telepon balik nanti.",
            "avoid": "Jangan biarkan batas waktu buatan membuat Anda buru-buru.",
            "why": "Urgensi palsu dirancang agar Anda bertindak sebelum sempat berpikir.",
        },
        "en": {
            "title": "Time pressure",
            "say": "I can't decide right now. I'll call back later.",
            "avoid": "Don't let an artificial deadline rush you.",
            "why": "Fake urgency exists to make you act before you can think.",
        },
    },
    "financial_demand": {
        "id": {
            "title": "Permintaan uang",
            "say": "Saya tidak mengirim uang lewat telepon. Saya telepon balik ke nomor yang saya punya.",
            "avoid": "Jangan transfer ke rekening baru, e-wallet, atau crypto.",
            "why": "Permintaan uang mendesak lewat telepon adalah pola penipuan paling umum.",
        },
        "en": {
            "title": "Money demand",
            "say": "I don't send money over the phone. I'll call back on the number I already have.",
            "avoid": "Never transfer to a new account, e-wallet, or crypto.",
            "why": "An urgent phone request for money is the most common fraud pattern.",
        },
    },
    "credential_harvest": {
        "id": {
            "title": "Permintaan OTP / PIN",
            "say": "Bank tidak pernah minta OTP atau PIN. Saya tidak akan memberikannya.",
            "avoid": "Jangan pernah sebutkan OTP, PIN, password, atau CVC ke siapa pun.",
            "why": "Tidak ada institusi sah yang meminta kode rahasia lewat telepon.",
        },
        "en": {
            "title": "OTP / PIN request",
            "say": "No bank ever asks for an OTP or PIN. I won't share it.",
            "avoid": "Never read out an OTP, PIN, password, or CVC to anyone.",
            "why": "No legitimate institution asks for secret codes over the phone.",
        },
    },
    "authority_impersonation": {
        "id": {
            "title": "Mengaku pihak berwenang",
            "say": "Baik, saya akan hubungi kantor resmi Anda lewat nomor yang saya cari sendiri.",
            "avoid": "Jangan percaya nomor yang mereka berikan. Tutup telepon.",
            "why": "Polisi/bank asli tidak meminta uang atau data rahasia lewat telepon.",
        },
        "en": {
            "title": "Authority impersonation",
            "say": "Alright, I'll contact your office through a number I look up myself.",
            "avoid": "Don't trust the number they give you. Hang up.",
            "why": "Real police/banks don't demand money or secrets over the phone.",
        },
    },
    "isolation_tactic": {
        "id": {
            "title": "Upaya isolasi — BAHAYA",
            "say": "Saya akan bicara dengan keluarga saya dulu.",
            "avoid": "Jangan menuruti permintaan untuk merahasiakan panggilan ini.",
            "why": "Penipu mengisolasi korban agar tidak ada yang bisa mengingatkan. Ini tanda paling berbahaya.",
        },
        "en": {
            "title": "Isolation attempt — DANGER",
            "say": "I'm going to talk to my family first.",
            "avoid": "Do not keep this call secret as they demand.",
            "why": "Scammers isolate victims so nobody can warn them. This is the most dangerous sign.",
        },
    },
    "reward_lure": {
        "id": {
            "title": "Iming-iming hadiah",
            "say": "Saya tidak mengikuti undian apa pun. Terima kasih.",
            "avoid": "Jangan bayar biaya apa pun untuk 'mengklaim hadiah'.",
            "why": "Hadiah sah tidak pernah meminta pembayaran atau data pribadi di depan.",
        },
        "en": {
            "title": "Reward lure",
            "say": "I didn't enter any draw. No thank you.",
            "avoid": "Never pay a fee to 'claim a prize'.",
            "why": "Legitimate prizes never require an upfront payment or personal data.",
        },
    },
}

_FALLBACK = {
    "id": {
        "title": "Tanda mencurigakan",
        "say": "Saya tidak bisa memastikan ini aman. Saya telepon balik lewat nomor yang saya punya.",
        "avoid": "Jangan kirim uang atau data rahasia.",
        "why": "Beberapa sinyal penipuan terdeteksi. Amannya: hentikan dan verifikasi lewat jalur terpisah.",
    },
    "en": {
        "title": "Suspicious signals",
        "say": "I can't confirm this is safe. I'll call back on the number I already have.",
        "avoid": "Don't send money or share secrets.",
        "why": "Several fraud signals fired. Play it safe: stop and verify through a separate channel.",
    },
}


def _verify_actions(language: str, level: str) -> List[str]:
    if language == "id":
        actions = [
            "Tutup panggilan ini sekarang.",
            "Telepon balik orang/institusi itu lewat nomor yang KAMU punya — bukan nomor yang mereka berikan.",
            "Jangan pernah bagikan OTP, PIN, atau kata sandi.",
        ]
        if level in ("high", "critical"):
            actions.append("Beri tahu anggota Trust Circle sekarang untuk verifikasi silang.")
        return actions
    actions = [
        "End this call now.",
        "Call the person/institution back on a number YOU already have — never the one they gave you.",
        "Never share an OTP, PIN, or password.",
    ]
    if level in ("high", "critical"):
        actions.append("Alert your Trust Circle now for cross-verification.")
    return actions


def build_guidance(tactics: List[str], risk_level: str, language: str = "en", safe_word_challenge: str = "") -> dict:
    """Compose reply scripts + verification actions for one analysis."""
    lang = language if language in ("id", "en") else "en"
    scripts = []
    for tactic in tactics:
        entry = _SCRIPTS.get(tactic, {}).get(lang) or _FALLBACK[lang]
        scripts.append(
            {
                "tactic": tactic,
                "title": entry["title"],
                "say": entry["say"],
                "avoid": entry["avoid"],
                "why": entry["why"],
            }
        )

    if not scripts:
        fb = _FALLBACK[lang]
        scripts.append(
            {"tactic": "general", "title": fb["title"], "say": fb["say"],
             "avoid": fb["avoid"], "why": fb["why"]}
        )

    return {
        "safe_word_challenge": safe_word_challenge,
        "reply_scripts": scripts,
        "verify_actions": _verify_actions(lang, risk_level),
    }