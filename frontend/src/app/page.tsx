"use client";

import { useState, useEffect } from "react";

type RiskLevel = "low" | "medium" | "high" | "critical";
type ScamTactic = "urgency" | "financial_demand" | "credential_harvest" | "authority_impersonation" | "isolation_tactic" | "reward_lure" | "surveillance_pressure";

interface AnalysisResult {
  risk_score: number;
  level: RiskLevel;
  tactics: string[];
  evidence: string[];
  recommendation: string;
  transcript?: string;
  language?: string;
  audio_deepfake_score?: number;
  is_scam: boolean;
}

export default function ScamGuardHUD() {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Map tactics to readable labels (bilingual)
  const tacticLabels: Record<string, { en: string; id: string }> = {
    urgency: { en: "Time pressure", id: "Tekanan waktu" },
    financial_demand: { en: "Financial demand", id: "Permintaan uang" },
    credential_harvest: { en: "OTP/credentials", id: "OTP/credential" },
    authority_impersonation: { en: "Authority fake", id: "Pura-pura otoritas" },
    isolation_tactic: { en: "Don't hang up", id: "Jangan putus telepon" },
    reward_lure: { en: "Prize/lure", id: "Hadiah/penggoda" },
    surveillance_pressure: { en: "Surveillance", id: "Pengawasan" },
  };

  const getRiskColor = (level: RiskLevel) => {
    switch (level) {
      case "critical": return "text-red-600 bg-red-100 border-red-500";
      case "high": return "text-orange-600 bg-orange-100 border-orange-500";
      case "medium": return "text-yellow-600 bg-yellow-100 border-yellow-500";
      default: return "text-green-600 bg-green-100 border-green-500";
    }
  };

  const getBarColor = (score: number) => {
    if (score >= 0.7) return "bg-red-600";
    if (score >= 0.4) return "bg-orange-500";
    if (score >= 0.15) return "bg-yellow-500";
    return "bg-green-500";
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
      const response = await fetch("http://localhost:8000/api/analyze/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript, deepfake_audio_hint: 0, deepfake_video_hint: 0 }),
      });

      const data = await response.json();
      setResult(data);
    } catch (e) {
      setError("Connection failed. Is backend running at http://localhost:8000?");
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
      const response = await fetch("http://localhost:8000/api/analyze/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (e) {
      setError("File upload failed. Is backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <span className="text-4xl">🛡</span> ScamGuard Multimodal
            </h1>
            <p className="text-slate-400">Real-time voice call & voice note analysis</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-400">Bilingual</div>
            <div className="text-lg font-semibold">ID + EN</div>
          </div>
        </header>

        {/* Input Section */}
        <section className="bg-slate-800 rounded-xl p-6 mb-6 border border-slate-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>🎤</span> Input Analysis
          </h2>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste transcript or type voice note text here..."
            className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          />

          <div className="flex gap-3 mt-4">
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg font-medium transition flex items-center gap-2">
              <span>📁</span> Upload Voice Note
              <input type="file" accept="audio/*,video/*" onChange={uploadFile} className="hidden" />
            </label>
            <button
              onClick={analyze}
              disabled={loading || !transcript.trim()}
              className={`px-5 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
                loading || !transcript.trim()
                  ? "bg-slate-700 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span> Analyzing...
                </>
              ) : (
                <span>🔍 Analyze</span>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
        </section>

        {/* Results */}
        {result && (
          <section className="animate-fade-in">
            {/* Risk Score Banner */}
            <div className={`rounded-xl p-6 mb-6 border-2 ${getRiskColor(result.level)}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm opacity-75 uppercase tracking-wider">Risk Level</div>
                  <div className="text-4xl font-bold capitalize">{result.level}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm opacity-75 uppercase tracking-wider">Confidence</div>
                  <div className="text-4xl font-bold">{(result.risk_score * 100).toFixed(0)}%</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-4 bg-slate-900/50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getBarColor(result.risk_score)} transition-all duration-500`}
                  style={{ width: `${result.risk_score * 100}%` }}
                />
              </div>
            </div>

            {/* Tactics Grid */}
            {result.tactics.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {result.tactics.map((tactic, i) => (
                  <div key={i} className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex items-center gap-3">
                    <div className="w-2 h-8 bg-red-500 rounded-full" />
                    <div>
                      <div className="text-sm text-slate-400">Tactic Detected</div>
                      <div className="font-semibold capitalize">
                        {tacticLabels[tactic]?.id || tacticLabels[tactic]?.en || tactic.replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Evidence Quotes */}
            {result.evidence.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-6 mb-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span>📝</span> Evidence
                </h3>
                <ul className="space-y-2">
                  {result.evidence.map((ev, i) => (
                    <li key={i} className="flex items-start gap-2 text-slate-300">
                      <span className="text-slate-500 mt-1">›</span>
                      <span>"{ev}"</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendation */}
            <div className="bg-emerald-900/20 rounded-xl p-6 border border-emerald-700/50">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>💡</span> Recommendation
              </h3>
              <p className="text-slate-200">{result.recommendation}</p>
            </div>

            {/* Transcript (if available) */}
            {result.transcript && (
              <div className="bg-slate-800 rounded-xl p-6 mt-6 border border-slate-700">
                <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-2">Transcript ({result.language})</h3>
                <p className="text-slate-300 italic">"{result.transcript}"</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
