"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type RiskLevel = "low" | "medium" | "high" | "critical";

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

export default function ScamGuardHUD() {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackendAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError("Transcript cannot be empty");
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
      setError(`Gagal menganalisis: ${message}. Pastikan backend aktif.`);
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
      setError(`Gagal upload / transkrip: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const tactics = result?.intent_result?.tactics_detected || [];
  const evidence = result?.intent_result?.evidence || [];
  const riskScore = result?.risk?.score ?? 0;
  const riskLevel = result?.risk?.level ?? "low";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">🛡️</span> ScamGuard Multimodal
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Deteksi scam multimodal: suara, manipulasi kalimat, dan deepfake AI
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-mono">Whisper Small + Heuristic AI</span>
          </div>
        </header>

        {/* Input Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
              <span>💬</span> Input Kalimat / Upload Voice Note
            </h2>
            <span className="text-xs text-slate-500">ID / EN</span>
          </div>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Ketik atau paste percakapan mencurigakan di sini... (Contoh: 'Halo selamat siang dari Bank BCA, ada transaksi mencurigakan. Sebutkan kode OTP sekarang juga!')"
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
                  <span className="animate-spin text-base">⚙️</span> Menganalisis...
                </>
              ) : (
                <>
                  <span>🔍</span> Analisis Teks
                </>
              )}
            </button>

            <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2 active:scale-95">
              <span>🎙️</span> Upload Audio / VN
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
                  <div className="text-xs uppercase tracking-wider font-mono opacity-80">Tingkat Risiko</div>
                  <div className="text-3xl md:text-4xl font-black capitalize tracking-tight mt-1">
                    {riskLevel === "critical" && "KRITIS (SCAM)"}
                    {riskLevel === "high" && "TINGGI (BAHAYA)"}
                    {riskLevel === "medium" && "SEDANG (WASPADA)"}
                    {riskLevel === "low" && "RENDAH (AMAN)"}
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-xs uppercase tracking-wider font-mono opacity-80">Skor Risiko</div>
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
                  Taktik Manipulasi Terdeteksi ({tactics.length})
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
                          {tacticLabels[tactic]?.id || tactic}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          {tacticLabels[tactic]?.en || tactic}
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
                  <span>📌</span> Bukti Kata Kunci Coercive
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
                  <span>🛡️</span> Rekomendasi Tindakan
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
                    Transkrip Suara (Whisper AI)
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
