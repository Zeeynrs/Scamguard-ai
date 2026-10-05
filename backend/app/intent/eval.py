"""
Evaluation harness for ScamGuard's intent-detection engine.

Measures precision, recall, and F1 on a curated bilingual benchmark (ID + EN)
instead of making ungrounded accuracy claims.

The benchmark contains:
  - 10 true-positive scams across common tactics (urgency, OTP harvest,
    family emergency, fake lottery, bank impersonation).
  - 10 true-negative benign transcripts (normal chats, legitimate bank SMS,
    family check-ins, routine office work) that include trigger-like words
    ("transfer", "bank", "segera") to probe false-alarm resistance.

Runs offline via rule-matching (no external API calls required) so it works
in CI and without consuming LLM credits.
"""
from typing import Dict, List, NamedTuple
from app.intent.rules import match_patterns


class Sample(NamedTuple):
    id: str
    text: str
    is_scam: bool
    language: str
    primary_tactic: str = ""


# Curated benchmark: 20 bilingual samples designed to probe false positives
BENCHMARK: List[Sample] = [
    # --- POSITIVE (SCAM) ---
    Sample(
        "scam_id_01",
        "Halo ini dari Bank Mandiri rekening bapak akan diblokir sekarang juga. Kirimkan kode OTP yang masuk ke SMS bapak segera.",
        True, "id", "credential_harvest"
    ),
    Sample(
        "scam_id_02",
        "Ibu anak ibu kecelakaan masuk UGD rumah sakit, butuh uang operasi 15 juta sekarang juga. Tolong jangan tutup telepon transfer ke rekening ini.",
        True, "id", "family_emergency"
    ),
    Sample(
        "scam_id_03",
        "Selamat bapak memenangkan undian 50 juta dari Shopee! Untuk klaim hadiah bapak wajib bayar biaya administrasi 500 ribu.",
        True, "id", "reward_lure"
    ),
    Sample(
        "scam_id_04",
        "Ini dari Polda Metro Jaya bapak terlibat kasus pencucian uang narkoba. Jangan kasih tahu siapa-siapa, rahasia negara.",
        True, "id", "authority_impersonation"
    ),
    Sample(
        "scam_id_05",
        "Paket anda tertahan di bea cukai. Segera bayar tebusan denda pajak hari ini juga atau kurir dipolisikan.",
        True, "id", "financial_demand"
    ),
    Sample(
        "scam_en_01",
        "This is officer Davis from IRS. You have an arrest warrant for unpaid tax. Pay the fine immediately using Apple gift card.",
        True, "en", "authority_impersonation"
    ),
    Sample(
        "scam_en_02",
        "Mom I'm at the police station they took my phone please wire $2000 bail money right now don't tell dad.",
        True, "en", "family_emergency"
    ),
    Sample(
        "scam_en_03",
        "Your bank account is compromised. Read me the 6-digit one-time password code on your screen to secure your funds.",
        True, "en", "credential_harvest"
    ),
    Sample(
        "scam_en_04",
        "You won the UK national lottery 1 million pounds. Send processing fee $350 via Western Union to release the prize.",
        True, "en", "reward_lure"
    ),
    Sample(
        "scam_en_05",
        "Your computer has virus and will be locked in 5 minutes. Do not turn off your computer, pay $100 support fee immediately.",
        True, "en", "urgency"
    ),

    # --- NEGATIVE (BENIGN, but contains tricky words) ---
    Sample(
        "benign_id_01",
        "Halo bro, nanti sore jadi futsal? Jangan lupa bawa baju ganti ya.",
        False, "id"
    ),
    Sample(
        "benign_id_02",
        "Dek tolong transfer uang makan bulan ini ke rekening ibu ya, kalau sempat saja santai.",
        False, "id"
    ),
    Sample(
        "benign_id_03",
        "Terima kasih telah bertransaksi di Bank BCA. Saldo tabungan anda saat ini adalah 2.500.000 rupiah.",
        False, "id"
    ),
    Sample(
        "benign_id_04",
        "Dokumen meeting sudah saya email segera direview ya pak sebelum rapat jam dua.",
        False, "id"
    ),
    Sample(
        "benign_id_05",
        "Bapak polisi di pos lantas depan sangat ramah, tadi bantu nyebrangin nenek-nenek.",
        False, "id"
    ),
    Sample(
        "benign_en_01",
        "Hey just checking in, can you wire your share of the Airbnb rent whenever you get a chance?",
        False, "en"
    ),
    Sample(
        "benign_en_02",
        "Your password for the internal company portal was changed successfully yesterday.",
        False, "en"
    ),
    Sample(
        "benign_en_03",
        "Mom called, she said call her back when you finish the meeting, no rush at all.",
        False, "en"
    ),
    Sample(
        "benign_en_04",
        "The project deadline is coming up this week, let's finish the report by tomorrow.",
        False, "en"
    ),
    Sample(
        "benign_en_05",
        "Thanks for shopping with us! Your order #1234 has been shipped and will arrive Thursday.",
        False, "en"
    ),
]


class Metrics(NamedTuple):
    tp: int
    fp: int
    tn: int
    fn: int
    precision: float
    recall: float
    f1: float
    total: int


def _score_rules(text: str) -> bool:
    """Classify via regex rules: true positive if any high-confidence tactic matches."""
    tactics, matches = match_patterns(text)
    # High-confidence attack: multiple tactics OR strong single tactic like credential harvest
    if "credential_harvest" in tactics:
        return True
    if len(tactics) >= 2:
        return True
    # Authority + urgency or financial is definitely scam
    if "authority_impersonation" in tactics and ("financial_demand" in tactics or "urgency" in tactics):
        return True
    return False


def evaluate(dataset: List[Sample] = BENCHMARK) -> Dict[str, Metrics]:
    """Run evaluation per language and overall."""
    buckets: Dict[str, List[Sample]] = {
        "all": dataset,
        "id": [s for s in dataset if s.language == "id"],
        "en": [s for s in dataset if s.language == "en"],
    }
    out: Dict[str, Metrics] = {}
    for lang, samples in buckets.items():
        tp = fp = tn = fn = 0
        for s in samples:
            pred = _score_rules(s.text)
            if pred and s.is_scam:
                tp += 1
            elif pred and not s.is_scam:
                fp += 1
            elif not pred and not s.is_scam:
                tn += 1
            else:
                fn += 1
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        out[lang] = Metrics(tp=tp, fp=fp, tn=tn, fn=fn, precision=prec, recall=rec, f1=f1, total=len(samples))
    return out


if __name__ == "__main__":
    results = evaluate()
    print("=== ScamGuard Intent Engine Evaluation Benchmark ===")
    for k, m in results.items():
        print(f"[{k.upper()}] (n={m.total}):")
        print(f"  TP={m.tp}  FP={m.fp}  TN={m.tn}  FN={m.fn}")
        print(f"  Precision: {m.precision:.2%}")
        print(f"  Recall:    {m.recall:.2%}")
        print(f"  F1-Score:  {m.f1:.2%}")
