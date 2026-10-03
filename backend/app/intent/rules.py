"""
Bilingual scam tactic patterns: Indonesian and English.
Each tactic maps to a list of regex patterns and a human-readable description.
"""
import re
from typing import Dict, List, Tuple

SCAM_PATTERNS_ID = {
    "urgency": [
        r"\bsekarang\s+juga\b",
        r"\bsegera\b",
        r"\bjangan\s+tunggu\b",
        r"\bbatas\s+waktu\b",
        r"\bhari\s+ini\s+juga\b",
        r"\bkesempatan\s+terakhir\b",
        r"\bdalam\s+\d+\s+menit\b",
        r"\bblokir\s+(otomatis|segera)\b",
    ],
    "financial_demand": [
        r"\btransfer\b",
        r"\bkirim\s+(uang|dana|saldo)\b",
        r"\bnomor\s+rekening\b",
        r"\btop\s*up\b",
        r"\bvoucher\b",
        r"\bgift\s*card\b",
        r"\bdeposit\b",
        r"\bbiaya\s+administrasi\b",
        r"\btebusan\b",
    ],
    "credential_harvest": [
        r"\bOTP\b",
        r"\bkode\s+verifikasi\b",
        r"\bPIN\b",
        r"\bpassword\b",
        r"\bnomor\s+kartu\b",
        r"\bCVC\b",
        r"\bCVV\b",
        r"\b3\s+digit\s+di\s+belakang\b",
        r"\bmasa\s+berlaku\b",
    ],
    "authority_impersonation": [
        r"\b(polisi|kepolisian|polda|polres)\b",
        r"\bkejaksaan\b",
        r"\bbank\s+(indonesia|bca|mandiri|bni|bri)\b",
        r"\bpetugas\s+bank\b",
        r"\bcustomer\s+service\s+(bank|shopee|tokopedia|dana|gopay)\b",
        r"\bdireksi\b",
        r"\bpajak\b",
        r"\bkpk\b",
    ],
    "isolation_tactic": [
        r"\bjangan\s+(tutup|putus|matikan)\s+(telepon|panggilan)\b",
        r"\bjangan\s+kasih\s+tahu\s+siapa[- ]siapa\b",
        r"\bjangan\s+ke\s+bank\b",
        r"\bjangan\s+bicara\s+dengan\s+orang\s+lain\b",
        r"\brahasia\s+negara\b",
        r"\bproses\s+penyelidikan\b",
    ],
    "reward_lure": [
        r"\bhadiah\b",
        r"\bundian\b",
        r"\bselamat\s+anda\s+menang\b",
        r"\bjackpot\b",
        r"\bbonus\b",
        r"\bcashback\b",
        r"\bkompensasi\b",
        r"\bklaim\s+hadiah\b",
    ],
    "family_emergency": [
        r"\b(anak|istri|suami|ibu|ayah)\s+anda\s+(kecelakaan|ditahan|diculik)\b",
        r"\bmasuk\s+rumah\s+sakit\b",
        r"\butang\s+(anak|keluarga)\b",
        r"\bbutuh\s+darah\s+segera\b",
        r"\bbutuh\s+operasi\s+segera\b",
    ],
}

SCAM_PATTERNS_EN = {
    "urgency": [
        r"\bright\s+now\b",
        r"\bimmediately\b",
        r"\bdon'?t\s+wait\b",
        r"\btime\s+limit\b",
        r"\btoday\s+only\b",
        r"\blast\s+chance\b",
        r"\bwithin\s+\d+\s+minutes\b",
        r"\baccount\s+suspended\b",
    ],
    "financial_demand": [
        r"\bwire\s+transfer\b",
        r"\bsend\s+(money|funds)\b",
        r"\bbank\s+account\b",
        r"\bgift\s*cards?\b",
        r"\bcrypto(currency)?\b",
        r"\bbitcoin\b",
        r"\bprocessing\s+fee\b",
        r"\bransom\b",
        r"\bbail\b",
    ],
    "credential_harvest": [
        r"\bOTP\b",
        r"\bverification\s+code\b",
        r"\bPIN\b",
        r"\bpassword\b",
        r"\bcredit\s+card\s+number\b",
        r"\bCVC\b",
        r"\bCVV\b",
        r"\bsocial\s+security\b",
        r"\bSSN\b",
    ],
    "authority_impersonation": [
        r"\bpolice\b",
        r"\bfbi\b",
        r"\birs\b",
        r"\bfederal\s+agent\b",
        r"\bbank\s+(security|fraud\s+department)\b",
        r"\bcustomer\s+support\b",
        r"\bceo\b",
        r"\bexecutive\b",
    ],
    "isolation_tactic": [
        r"\bdon'?t\s+hang\s+up\b",
        r"\bdo\s+not\s+tell\s+anyone\b",
        r"\bstay\s+on\s+the\s+line\b",
        r"\bconfidential\s+investigation\b",
        r"\bkeep\s+this\s+between\s+us\b",
    ],
    "reward_lure": [
        r"\byou'?ve?\s+won\b",
        r"\blottery\b",
        r"\bprize\b",
        r"\bclaim\s+your\s+reward\b",
        r"\brefund\s+waiting\b",
        r"\bcompensation\b",
    ],
    "family_emergency": [
        r"\byour\s+(son|daughter|kid|wife|husband|mother|father)\b.*(accident|arrested|kidnapped|hospital)",
        r"\bin\s+jail\b",
        r"\bneeds\s+bail\b",
        r"\bemergency\s+surgery\b",
    ],
}


def match_patterns(text: str) -> Tuple[List[str], List[str]]:
    """
    Returns (tactics_detected, evidence_list)
    Case-insensitive search over ID and EN pattern sets.
    """
    if not text:
        return [], []

    tactics = set()
    evidence = []

    # Merge ID and EN under common keys
    keys = set(SCAM_PATTERNS_ID.keys()) | set(SCAM_PATTERNS_EN.keys())

    for key in keys:
        patterns = SCAM_PATTERNS_ID.get(key, []) + SCAM_PATTERNS_EN.get(key, [])
        for p in patterns:
            for m in re.finditer(p, text, re.IGNORECASE):
                tactics.add(key)
                evidence.append(f"[{key}] \"{m.group(0)}\"")

    return sorted(list(tactics)), evidence
