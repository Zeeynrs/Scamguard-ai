"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type RiskLevel = "low" | "medium" | "high" | "critical";
type Language = "en" | "id";

interface BackendAnalysisReport {
  timestamp: string;
  mode: string;
  audio_result?: {
    transcript?: string;
    language?: string;
    deepfake_score?: number;
    deepfake_indications?: string[];
  };
  vision_result?: {
    face_detected?: boolean;
    deepfake_score?: number;
  };
  intent_result?: {
    is_scam: boolean;
    confidence: number;
    tactics_detected: string[];
    evidence: string[];
    risk_level: string;
  };
  risk: {
    score: number;
    level: RiskLevel;
    weighted_intent_llm: number;
    weighted_intent_rules: number;
    weighted_audio: number;
    weighted_video: number;
    indications: string[];
    recommendation: string;
  };
  raw_scores?: Record<string, number>;
}

const translations = {
  en: {
    title: "ScamGuard Multimodal",
    subtitle: "Scam detection: voice analysis, message manipulation, and AI deepfake",
    badge: "Whisper Small + Heuristic AI",
    input_section: "Text Input / Upload Voice Note",
    placeholder: "Type or paste suspicious conversation here... (Example: 'Hello from Bank BCA, suspicious transaction detected. Tell me the OTP code now!')",
    analyze_btn: "Analyze Text",
    analyzing: "Analyzing...",
    upload_btn: "Upload Audio / Voice Note",
    error_empty: "Transcript cannot be empty",
    risk_level: "Risk Level",
    risk_score: "Risk Score",
    critical: "CRITICAL (SCAM)",
    high: "HIGH (DANGEROUS)",
    medium: "MEDIUM (ALERT)",
    low: "LOW (SAFE)",
    tactics_detected: "Manipulation Tactics Detected",
    tactic_label: "Tactic",
    evidence_header: "Evidence Keywords",
    recommendation: "Recommended Action",
    transcript: "Voice Transcript (Whisper AI)",
    connection_failed: "Failed to analyze: Connection error. Ensure backend is running.",
    upload_failed: "Upload failed: File upload error.",
    urgency: "Time pressure",
    financial_demand: "Financial demand",
    credential_harvest: "OTP / Credentials",
    authority_impersonation: "Authority fake",
    isolation_tactic: "Isolation / Don't hang up",
    reward_lure: "Prize / Lottery lure",
    surveillance_pressure: "Surveillance pressure",
  },
  id: {
    title: "ScamGuard Multimodal",
    subtitle: "Deteksi scam multimodal: suara, manipulasi kalimat, dan deepfake AI",
    badge: "Whisper Small + Heuristic AI",
    input_section: "Input Kalimat / Upload Voice Note",
    placeholder: "Ketik atau paste percakapan mencurigakan di sini... (Contoh: 'Halo dari Bank BCA, ada transaksi mencurigakan. Sebutkan kode OTP sekarang juga!')",
    analyze_btn: "Analisis Teks",
    analyzing: "Menganalisis...",
    upload_btn: "Upload Audio / VN",
    error_empty: "Transcript tidak boleh kosong",
    risk_level: "Tingkat Risiko",
    risk_score: "Skor Risiko",
    critical: "KRITIS (SCAM)",
    high: "TINGGI (BAHAYA)",
    medium: "SEDANG (WASPADA)",
    low: "RENDAH (AMAN)",
    tactics_detected: "Taktik Manipulasi Terdeteksi",
    tactic_label: "Taktik",
    evidence_header: "Bukti Kata Kunci Coercive",
    recommendation: "Rekomendasi Tindakan",
    transcript: "Transkrip Suara (Whisper AI)",
    connection_failed: "Gagal menganalisis: Koneksi error. Pastikan backend aktif.",
    upload_failed: "Gagal upload: Error file upload.",
    urgency: "Tekanan waktu",
    financial_demand: "Permintaan uang",
    credential_harvest: "Pencurian OTP/Kredensial",
    authority_impersonation: "Pura-pura Otoritas/Bank",
    isolation_tactic: "Isolasi / Jangan Putus Telepon",
    reward_lure: "Iming-iming Hadiah",
    surveillance_pressure: "Tekanan Pengawasan",
  },
};

export default function ScamGuardHUD() {
  const [lang, setLang] = useState<Language>("en");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackendAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const t = translations[lang];

  const tacticLabels: Record<string, { en: string; id: string }> = {
    urgency: { en: "Time pressure", id: "Tekanan waktu" },
    financial_demand: { en: "Financial demand", id: "Permintaan uang" },
    credential_harvest: { en: "OTP / Credentials", id: "Pencurian OTP/Kredensial" },
    authority_impersonation: { en: "Authority fake", id: "Pura-pura Otoritas/Bank" },
    isolation_tactic: { en: "Isolation / Don't hang up", id: "Isolasi / Jangan Putus Telepon" },
    reward_lure: { en: "Prize / Lottery lure", id: "Iming-iming Hadiah" },
    surveillance_pressure: { en: "Surveillance pressure", id: "Tekanan Pengawasan" },
  };

  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case "critical": return "bg-red-500/20 text-red-400 border-red-500";
      case "high": return "bg-orange-500/20 text-orange-400 border-orange-500";
      case "medium": return "bg-yellow-500/20 text-yellow-400 border-yellow-500";
      default: return "bg-emerald-500/20 text-emerald-400 border-emerald-500";
    }
  };

  const getBarColor = (score: number) => {
    if (score >= 0.7) return "bg-red-500";
    if (score >= 0.4) return "bg-orange-500";
    if (score >= 0.15) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  const analyze = async () => {
    if (!transcript.trim()) {
      setError(t.error_empty);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/analyze/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript, deepfake_audio_hint: 0, deepfake_video_hint: 0 }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Request failed";
      setError(`${t.connection_failed} (${message})`);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE}/api/analyze/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
      if (data.audio_result?.transcript) {
        setTranscript(data.audio_result.transcript);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setError(`${t.upload_failed} (${message})`);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelText = (level: RiskLevel): string => {
    switch (level) {
      case "critical": return t.critical;
      case "high": return t.high;
      case "medium": return t.medium;
      default: return t.low;
    }
  };

  const tactics = result?.intent_result?.tactics_detected || [];
  const evidence = result?.intent_result?.evidence || [];
  const riskScore = result?.risk?.score ?? 0;
  const riskLevel = result?.risk?.level ?? "low";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header with Language Toggle */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">🛡️</span> {t.title}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {t.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-mono">{t.badge}</span>
            </div>
            {/* Language Toggle Buttons */}
            <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  lang === "en"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("id")}
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  lang === "id"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ID
              </button>
            </div>
          </div>
        </header>

        {/* Input Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <span>💬</span> {t.input_section}
            </h2>
          </div>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={t.placeholder}
            className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm resize-none"
          />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={analyze}
              disabled={loading || !transcript.trim()}
              className={`px-5 py-2.5 rounded-xl font-medium text-sm transition flex items-center gap-2 shadow-lg ${
                loading || !transcript.trim()
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 active:scale-95"
              }`}
            >
              {loading ? (
                <>
                  <span className="animate-spin text-base">⚙️</span> {t.analyzing}
                </>
              ) : (
                <>
                  <span>🔍</span> {t.analyze_btn}
                </>
              )}
            </button>

            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2 active:scale-95">
              <span>🎙️</span> {t.upload_btn}
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={uploadFile}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>

          {error && (
            <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl text-red-300 text-xs md:text-sm flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <p>{error}</p>
            </div>
          )}
        </section>

        {/* Results */}
        {result && (
          <section className="space-y-6 animate-fade-in">
            {/* Risk Banner */}
            <div className={`p-6 rounded-2xl border ${getRiskBadge(riskLevel)} bg-slate-900/90 shadow-2xl`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider font-mono opacity-80">{t.risk_level}</div>
                  <div className="text-3xl md:text-4xl font-black capitalize tracking-tight mt-1">
                    {getRiskLevelText(riskLevel)}
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-xs uppercase tracking-wider font-mono opacity-80">{t.risk_score}</div>
                  <div className="text-3xl md:text-4xl font-mono font-black mt-1">
                    {(riskScore * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-950 h-3 rounded-full mt-5 overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${getBarColor(riskScore)}`}
                  style={{ width: `${Math.min(100, Math.max(5, riskScore * 100))}%` }}
                />
              </div>
            </div>

            {/* Tactics Grid */}
            {tactics.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider font-mono">
                  {t.tactics_detected} ({tactics.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tactics.map((tactic, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3"
                    >
                      <span className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0" />
                      <div>
                        <div className="font-semibold text-sm text-slate-200">
                          {tacticLabels[tactic]?.[lang] || tactic}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          {lang === "en" ? tacticLabels[tactic]?.en : tacticLabels[tactic]?.id}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Quotes */}
            {evidence.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
                  <span>📌</span> {t.evidence_header}
                </h3>
                <ul className="space-y-2">
                  {evidence.map((ev, idx) => (
                    <li
                      key={idx}
                      className="bg-slate-950 border border-slate-800/80 px-3.5 py-2.5 rounded-lg text-xs md:text-sm font-mono text-slate-300 flex items-center gap-2"
                    >
                      <span className="text-red-400">›</span>
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendation */}
            {result.risk?.recommendation && (
              <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-2">
                  <span>🛡️</span> {t.recommendation}
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {result.risk.recommendation}
                </p>
              </div>
            )}

            {/* Transcript (jika dari Audio Upload) */}
            {result.audio_result?.transcript && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-wider font-mono text-slate-400">
                    {t.transcript}
                  </h3>
                  {result.audio_result.language && (
                    <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                      {result.audio_result.language}
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-sm italic font-serif">
                  "{result.audio_result.transcript}"
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
