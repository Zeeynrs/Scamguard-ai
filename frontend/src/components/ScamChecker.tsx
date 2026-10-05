"use client";

import { useEffect, useMemo, useState } from "react";
import LiveCallMonitor from "@/components/LiveCallMonitor";
import FamilyGuard, { type FamilyGuardGuidance } from "@/components/FamilyGuard";
import {
  ChatCircleText,
  Microphone,
  VideoCamera,
  MagnifyingGlass,
  Warning,
  PushPin,
  ChatCircleDots,
  CheckCircle,
  Sparkle,
  Globe,
  EnvelopeSimple,
  DeviceMobile,
  Copy,
  Check,
  ArrowClockwise,
  Info,
} from "@/components/icons";
import { apiFetch } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Language = "en" | "id";
export type CheckerMode = "text" | "upload" | "live";
type InputKind = "text" | "url" | "message" | "email";

export interface BackendAnalysisReport {
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
  raw_scores?: Record<string, number | boolean>;
  family_guard?: FamilyGuardGuidance | null;
  url_meta?: {
    url: string;
    final_url?: string;
    domain?: string;
    status_code?: number | null;
    ssl_valid?: boolean;
    redirect_count?: number;
    fetch_error?: string | null;
    content_preview?: string;
  };
}

const translations = {
  en: {
    kicker: "Scam checker",
    title: "What do you want to check?",
    subtitle:
      "Paste a URL, message, email, or other text. Or upload a voice note. Results are risk indicators, not a verdict.",
    input_kinds_label: "Content type (helps you describe it — analysis is the same text pipeline)",
    kind_text: "Text",
    kind_url: "URL",
    kind_message: "Message",
    kind_email: "Email",
    placeholder_text:
      "Paste the suspicious text… e.g. “Hello from Bank BCA, suspicious transaction. Send the OTP now.”",
    placeholder_url: "Paste the full URL, including https://",
    placeholder_message: "Paste the SMS, WhatsApp, or chat message…",
    placeholder_email: "Paste the email subject and body…",
    analyze_btn: "Analyze",
    analyzing: "Analyzing…",
    upload_btn: "Choose audio or video file",
    upload_hint: "Accepted: audio and video files. Transcribed, then scored with the same fusion pipeline.",
    error_empty: "Add some content before analyzing.",
    risk_level: "Risk level",
    risk_score: "Risk score",
    critical: "DANGEROUS",
    high: "HIGH RISK",
    medium: "SUSPICIOUS",
    low: "LOW RISK",
    why: "Why this score",
    tactics_detected: "Detected indicators",
    evidence_header: "Quoted evidence",
    recommendation: "Recommended action",
    transcript: "Voice transcript",
    connection_failed: "Could not reach the analysis service.",
    upload_failed: "Upload failed.",
    empty_title: "No analysis yet",
    empty_body:
      "Submit content above. You will see a risk level, the indicators that fired, quoted evidence, and a recommended next step.",
    live_monitor: "Live Call Monitor",
    text_tab: "Text / URL / message",
    upload_tab: "Voice note",
    examples: "Try an example",
    copy_report: "Copy summary",
    copied: "Copied",
    reset: "New check",
    disclaimer:
      "Based on available signals. Review independently before you click, pay, or share codes.",
    after_submit: "After you submit, ScamGuard scores language patterns and any audio/video signals, then returns a calibrated risk level.",
    weights: "How the score was built",
    llm: "LLM intent",
    rules: "Heuristic rules",
    audio: "Audio",
    video: "Video",
    none_tactics: "No named tactics fired. The score still reflects overall intent signals.",
    step1: "Reading input…",
    step2: "Checking suspicious patterns…",
    step3: "Evaluating risk indicators…",
    step4: "Generating security assessment…",
    safe_note: "SAFE is not a separate backend class. Low risk is the safest bucket this model returns.",
  },
  id: {
    kicker: "Pengecek scam",
    title: "Apa yang ingin kamu periksa?",
    subtitle:
      "Tempel URL, pesan, email, atau teks lain. Atau unggah voice note. Hasil adalah indikator risiko, bukan vonis.",
    input_kinds_label: "Jenis konten (membantu deskripsi — analisis memakai pipeline teks yang sama)",
    kind_text: "Teks",
    kind_url: "URL",
    kind_message: "Pesan",
    kind_email: "Email",
    placeholder_text:
      "Tempel teks mencurigakan… mis. “Halo dari Bank BCA, transaksi mencurigakan. Kirim OTP sekarang.”",
    placeholder_url: "Tempel URL lengkap, termasuk https://",
    placeholder_message: "Tempel SMS, WhatsApp, atau chat…",
    placeholder_email: "Tempel subjek dan isi email…",
    analyze_btn: "Analisis",
    analyzing: "Menganalisis…",
    upload_btn: "Pilih file audio atau video",
    upload_hint: "Diterima: file audio dan video. Ditranskrip, lalu dinilai dengan pipeline fusi yang sama.",
    error_empty: "Isi konten dulu sebelum analisis.",
    risk_level: "Tingkat risiko",
    risk_score: "Skor risiko",
    critical: "BERBAHAYA",
    high: "RISIKO TINGGI",
    medium: "MENCURIGAKAN",
    low: "RISIKO RENDAH",
    why: "Mengapa skor ini",
    tactics_detected: "Indikator terdeteksi",
    evidence_header: "Bukti yang dikutip",
    recommendation: "Rekomendasi tindakan",
    transcript: "Transkrip suara",
    connection_failed: "Tidak bisa menghubungi layanan analisis.",
    upload_failed: "Unggah gagal.",
    empty_title: "Belum ada analisis",
    empty_body:
      "Kirim konten di atas. Kamu akan melihat tingkat risiko, indikator yang terpicu, kutipan bukti, dan langkah berikutnya.",
    live_monitor: "Monitor panggilan",
    text_tab: "Teks / URL / pesan",
    upload_tab: "Voice note",
    examples: "Coba contoh",
    copy_report: "Salin ringkasan",
    copied: "Tersalin",
    reset: "Cek baru",
    disclaimer:
      "Berdasarkan sinyal yang tersedia. Verifikasi sendiri sebelum klik, bayar, atau membagikan kode.",
    after_submit: "Setelah dikirim, ScamGuard menilai pola bahasa dan sinyal audio/video jika ada, lalu mengembalikan tingkat risiko terkalibrasi.",
    weights: "Bagaimana skor disusun",
    llm: "Intent LLM",
    rules: "Aturan heuristik",
    audio: "Audio",
    video: "Video",
    none_tactics: "Tidak ada taktik bernama yang terpicu. Skor tetap mencerminkan sinyal intent keseluruhan.",
    step1: "Membaca input…",
    step2: "Memeriksa pola mencurigakan…",
    step3: "Menilai indikator risiko…",
    step4: "Menyusun asesmen keamanan…",
    safe_note: "AMAN bukan kelas terpisah di backend. Risiko rendah adalah bucket paling aman yang dikembalikan model ini.",
  },
};

const tacticLabels: Record<string, { en: string; id: string }> = {
  urgency: { en: "Time pressure", id: "Tekanan waktu" },
  financial_demand: { en: "Financial demand", id: "Permintaan uang" },
  credential_harvest: { en: "OTP / credentials", id: "Pencurian OTP/kredensial" },
  authority_impersonation: { en: "Authority impersonation", id: "Peniruan otoritas" },
  isolation_tactic: { en: "Isolation / don’t hang up", id: "Isolasi / jangan tutup telepon" },
  reward_lure: { en: "Prize / lottery lure", id: "Iming-iming hadiah" },
  surveillance_pressure: { en: "Surveillance pressure", id: "Tekanan pengawasan" },
};

const examples: { id: string; enLabel: string; idLabel: string; en: string; idText: string; enText: string }[] = [
  {
    id: "otp",
    enLabel: "Bank OTP",
    idLabel: "OTP bank",
    en: "Bank OTP",
    enText: "Hello from Bank of America, a suspicious $5,000 transaction detected. Provide the OTP now or your account will be frozen.",
    idText: "Halo dari Bank BCA, ada transaksi mencurigakan Rp15.000.000. Sebutkan kode OTP sekarang juga atau rekening diblokir.",
  },
  {
    id: "delivery",
    enLabel: "Fake delivery",
    idLabel: "Paket palsu",
    en: "Fake delivery",
    enText: "Your package is held at customs. Pay the $185 clearance fee via this link within 1 hour or it will be returned: http://jnt-reschedule-pay.example/claim",
    idText: "Paketmu tertahan di bea cukai. Bayar biaya Rp185.000 lewat tautan ini dalam 1 jam atau paket dikembalikan: http://jnt-reschedule-pay.example/claim",
  },
  {
    id: "job",
    enLabel: "Job offer",
    idLabel: "Lowongan palsu",
    en: "Job offer",
    enText: "Congratulations, you passed the remote interview. Transfer the uniform fee of $450 to this account today so your contract becomes active.",
    idText: "Selamat, kamu lolos interview remote. Transfer biaya seragam Rp450.000 ke rekening ini hari ini supaya kontrak aktif.",
  },
  {
    id: "authority",
    enLabel: "Fake authority",
    idLabel: "Otoritas palsu",
    en: "Fake authority",
    enText: "This is from the Federal Police. Your account is linked to a case. Do not hang up. Transfer the funds to the secure account we provide now.",
    idText: "Ini dari kepolisian. Rekeningmu terkait kasus. Jangan putus telepon. Transfer dana ke rekening aman yang kami sebutkan sekarang.",
  },
];

const riskBadge: Record<RiskLevel, string> = {
  critical: "badge-critical",
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
};
const riskText: Record<RiskLevel, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-emerald-400",
};
const riskBar: Record<RiskLevel, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-emerald-500",
};
const riskBanner: Record<RiskLevel, string> = {
  critical: "bg-red-950/25 border-red-500/40",
  high: "bg-orange-950/20 border-orange-500/35",
  medium: "bg-yellow-950/15 border-yellow-500/30",
  low: "bg-emerald-950/15 border-emerald-500/30",
};

const LOAD_STEPS = ["step1", "step2", "step3", "step4"] as const;

interface ScamCheckerProps {
  language: Language;
  mode: CheckerMode;
  setMode: (m: CheckerMode) => void;
}

export default function ScamChecker({ language, mode, setMode }: ScamCheckerProps) {
  const t = translations[language];
  const [kind, setKind] = useState<InputKind>("text");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [result, setResult] = useState<BackendAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setLoadStep((s) => (s < LOAD_STEPS.length - 1 ? s + 1 : s));
    }, 900);
    return () => window.clearInterval(id);
  }, [loading]);

  const placeholder =
    kind === "url"
      ? t.placeholder_url
      : kind === "message"
        ? t.placeholder_message
        : kind === "email"
          ? t.placeholder_email
          : t.placeholder_text;

  const getRiskLevelText = (level: RiskLevel) => {
    switch (level) {
      case "critical":
        return t.critical;
      case "high":
        return t.high;
      case "medium":
        return t.medium;
      default:
        return t.low;
    }
  };

  const tactics = result?.intent_result?.tactics_detected || [];
  const evidence = result?.intent_result?.evidence || [];
  const riskScore = result?.risk?.score ?? 0;
  const riskLevel = result?.risk?.level ?? "low";

  const tabs: { id: CheckerMode; label: string; Icon: typeof ChatCircleText; disabled?: boolean }[] = [
    { id: "text", label: t.text_tab, Icon: ChatCircleText },
    { id: "upload", label: t.upload_tab, Icon: Microphone },
    { id: "live", label: `${t.live_monitor} (Inactive)`, Icon: VideoCamera, disabled: true },
  ];

  const kinds: { id: InputKind; label: string; Icon: typeof Globe }[] = [
    { id: "text", label: t.kind_text, Icon: ChatCircleText },
    { id: "url", label: t.kind_url, Icon: Globe },
    { id: "message", label: t.kind_message, Icon: DeviceMobile },
    { id: "email", label: t.kind_email, Icon: EnvelopeSimple },
  ];

  const analyze = async () => {
    if (!transcript.trim()) {
      setError(t.error_empty);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (kind === "url") {
        const urlResponse = await apiFetch(`${API_BASE}/api/analyze/url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: transcript.trim(),
            language,
          }),
        });
        if (!urlResponse.ok) {
          const body = await urlResponse.json().catch(() => null);
          throw new Error(`HTTP ${urlResponse.status}: ${body?.detail || urlResponse.statusText}`);
        }
        const url: any = await urlResponse.json();
        // Normalize URL report into the shape the result panel already renders.
        setResult({
          timestamp: new Date().toISOString(),
          mode: "url",
          intent_result: {
            is_scam: (url.risk_score ?? 0) >= 0.5,
            confidence: url.risk_score ?? 0,
            tactics_detected: url.tactics_detected ?? [],
            evidence: url.evidence ?? [],
            risk_level: url.risk_level ?? "low",
          },
          risk: {
            score: url.risk_score ?? 0,
            level: url.risk_level ?? "low",
            weighted_intent_llm: 0,
            weighted_intent_rules: 0,
            weighted_audio: 0,
            weighted_video: 0,
            indications: url.indications ?? [],
            recommendation: url.explanation ?? "",
          },
          url_meta: {
            url: url.url,
            final_url: url.final_url,
            domain: url.domain,
            status_code: url.status_code,
            ssl_valid: url.ssl_valid,
            redirect_count: url.redirect_count,
            fetch_error: url.fetch_error,
            content_preview: url.content_preview,
          },
        });
        return;
      }
      const response = await apiFetch(`${API_BASE}/api/analyze/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: transcript,
          deepfake_audio_hint: 0,
          deepfake_video_hint: 0,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      setResult(await response.json());
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
      const response = await apiFetch(`${API_BASE}/api/analyze/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      setResult(data);
      if (data.audio_result?.transcript) setTranscript(data.audio_result.transcript);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(`${t.upload_failed} (${message})`);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const copySummary = async () => {
    if (!result) return;
    const lines = [
      `ScamGuard — ${getRiskLevelText(riskLevel)} (${(riskScore * 100).toFixed(1)}%)`,
      result.risk?.recommendation || "",
      tactics.length
        ? `Indicators: ${tactics.map((x) => tacticLabels[x]?.[language] || x).join(", ")}`
        : "",
      evidence.length ? `Evidence: ${evidence.join("; ")}` : "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(language === "id" ? "Gagal menyalin." : "Could not copy.");
    }
  };

  const whyItems = useMemo(() => {
    const items: string[] = [];
    for (const tac of tactics) items.push(tacticLabels[tac]?.[language] || tac);
    if (result?.risk?.indications) {
      for (const ind of result.risk.indications) {
        if (!items.includes(ind)) items.push(ind);
      }
    }
    return items;
  }, [tactics, result, language]);

  return (
    <section id="checker" className="scroll-mt-24 py-8 md:py-12">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <header className="mb-6 md:mb-8">
          <p className="text-xs font-mono uppercase tracking-[0.16em] text-blue-400 mb-2">{t.kicker}</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{t.title}</h2>
          <p className="mt-3 text-slate-400 leading-relaxed max-w-2xl">{t.subtitle}</p>
          <p className="mt-2 text-sm text-slate-500 max-w-2xl">{t.after_submit}</p>
        </header>

        <div
          className="flex gap-1.5 glass px-1.5 py-1.5 rounded-2xl mb-5"
          role="tablist"
          aria-label={t.kicker}
        >
          {tabs.map(({ id, label, Icon, disabled }) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              disabled={disabled}
              onClick={() => setMode(id)}
              className={`flex-1 px-2.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 focus-ring ${
                mode === id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : disabled
                    ? "text-slate-700 cursor-not-allowed"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Icon size={17} weight={mode === id ? "fill" : "regular"} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{id === "text" ? t.kind_text : id === "upload" ? t.upload_tab.split(" ")[0] : "Live"}</span>
            </button>
          ))}
        </div>

        {mode === "live" ? (
          <div id="live-monitor" className="scroll-mt-24">
            <LiveCallMonitor />
          </div>
        ) : (
          <>
            <section className="card-elevated p-5 md:p-6 space-y-4">
              {mode === "text" && (
                <>
                  <fieldset>
                    <legend className="text-xs text-slate-400 mb-2">{t.input_kinds_label}</legend>
                    <div className="flex flex-wrap gap-2">
                      {kinds.map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setKind(id)}
                          aria-pressed={kind === id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all focus-ring ${
                            kind === id
                              ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                              : "glass text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Icon size={14} weight={kind === id ? "fill" : "regular"} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="sr-only" htmlFor="scam-input">
                    {placeholder}
                  </label>
                  <textarea
                    id="scam-input"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder={placeholder}
                    className="input-field h-36 resize-none scroll-thin"
                  />

                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500 mb-2 flex items-center gap-2">
                      <span className="inline-block w-3 h-px bg-slate-700" />
                      {t.examples}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {examples.map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => {
                            setKind("message");
                            setTranscript(language === "id" ? ex.idText : ex.enText);
                            setError(null);
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 bg-slate-900/40 hover:bg-slate-800/60 focus-ring transition-colors"
                        >
                          {language === "id" ? ex.idLabel : ex.enLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {mode === "upload" && (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center">
                  <Microphone size={28} weight="duotone" className="text-blue-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-300 mb-4">{t.upload_hint}</p>
                  <label className="cursor-pointer btn-primary inline-flex">
                    <Microphone size={17} weight="bold" />
                    {t.upload_btn}
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      onChange={uploadFile}
                      disabled={loading}
                      className="sr-only"
                    />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {mode === "text" && (
                  <button
                    onClick={analyze}
                    disabled={loading || !transcript.trim()}
                    className="btn-primary"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                        {t.analyzing}
                      </>
                    ) : (
                      <>
                        <MagnifyingGlass size={17} weight="bold" />
                        {t.analyze_btn}
                      </>
                    )}
                  </button>
                )}
                {(result || error) && !loading && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setResult(null);
                      setError(null);
                      setTranscript("");
                    }}
                  >
                    <ArrowClockwise size={16} weight="bold" />
                    {t.reset}
                  </button>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="p-3.5 md:p-4 glass bg-red-950/30 border-red-800/60 text-red-300 text-xs md:text-sm"
                >
                  <div className="flex items-start gap-2.5">
                    <Warning size={17} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </div>
                </div>
              )}
            </section>

            {loading && (
              <section className="card mt-5 p-5 md:p-6" aria-live="polite" aria-busy="true">
                <ol className="space-y-3">
                  {LOAD_STEPS.map((key, i) => {
                    const active = i === loadStep;
                    const done = i < loadStep;
                    return (
                      <li key={key} className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-mono ${
                            done
                              ? "bg-emerald-500/20 text-emerald-400"
                              : active
                                ? "bg-blue-600 text-white"
                                : "bg-slate-800 text-slate-500"
                          }`}
                        >
                          {done ? <Check size={12} weight="bold" /> : i + 1}
                        </span>
                        <span className={active ? "text-slate-100" : "text-slate-500"}>
                          {t[key]}
                        </span>
                        {active && (
                          <span className="ml-auto w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-4 text-xs text-slate-500">{t.disclaimer}</p>
              </section>
            )}

            {!loading && !result && !error && (
              <section className="mt-5 rounded-2xl border-2 border-dashed border-slate-800 glass p-8 text-center">
                <div className="w-14 h-14 rounded-2xl glass border-slate-800 grid place-items-center mx-auto mb-4">
                  <MagnifyingGlass size={24} weight="duotone" className="text-slate-500" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300">{t.empty_title}</h3>
                <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">{t.empty_body}</p>
              </section>
            )}

            {result && !loading && (
              <section className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
                <div className={`card-elevated p-6 border ${riskBanner[riskLevel]}`}>
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.15em] font-mono text-slate-400">
                        {t.risk_level}
                      </div>
                      <div className={`text-3xl md:text-4xl font-black tracking-tight mt-1 ${riskText[riskLevel]}`}>
                        {getRiskLevelText(riskLevel)}
                      </div>
                      <p className={`mt-2 inline-flex badge ${riskBadge[riskLevel]}`}>
                        {riskLevel}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-xs uppercase tracking-[0.15em] font-mono text-slate-400">
                        {t.risk_score}
                      </div>
                      <div className={`text-3xl md:text-4xl font-mono font-black mt-1 tabular-nums ${riskText[riskLevel]}`}>
                        {(riskScore * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="progress-bar mt-5">
                    <div
                      className={`progress-fill ${riskBar[riskLevel]}`}
                      style={{ width: `${Math.min(100, Math.max(4, riskScore * 100))}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500 flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    {t.disclaimer}
                  </p>
                </div>

                <div className="card p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-[0.12em] font-mono">
                    {t.why}
                  </h3>
                  {whyItems.length > 0 ? (
                    <ul className="space-y-2">
                      {whyItems.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">{t.none_tactics}</p>
                  )}
                </div>

                {tactics.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-[0.12em] font-mono">
                      {t.tactics_detected} ({tactics.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {tactics.map((tactic) => (
                        <div key={tactic} className="glass p-4 rounded-xl flex items-start gap-3">
                          <span className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0" />
                          <div className="font-semibold text-sm text-slate-200">
                            {tacticLabels[tactic]?.[language] || tactic}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {evidence.length > 0 && (
                  <div className="card p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-[0.12em] font-mono flex items-center gap-2">
                      <PushPin size={16} weight="fill" className="text-red-400" />
                      {t.evidence_header}
                    </h3>
                    <ul className="space-y-2">
                      {evidence.map((ev, idx) => (
                        <li
                          key={`${ev}-${idx}`}
                          className="glass border-slate-800/60 px-3.5 py-2.5 rounded-lg text-xs md:text-sm font-mono text-slate-300"
                        >
                          {ev}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.risk?.recommendation && (
                  <div className="card bg-emerald-950/15 border-emerald-800/40 p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-[0.12em] font-mono flex items-center gap-2">
                      <CheckCircle size={16} weight="fill" />
                      {t.recommendation}
                    </h3>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{result.risk.recommendation}</p>
                  </div>
                )}

                {result.url_meta && (
                  <div className="card p-5 space-y-3">
                    <h3 className="text-xs uppercase tracking-[0.12em] font-mono text-slate-400 flex items-center gap-2">
                      <Globe size={15} weight="fill" className="text-blue-400" />
                      {language === "id" ? "Detail URL" : "URL Details"}
                    </h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                      <div className="glass p-3 rounded-xl">
                        <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Domain</dt>
                        <dd className="text-slate-200 break-all mt-1">{result.url_meta.domain}</dd>
                      </div>
                      <div className="glass p-3 rounded-xl">
                        <dt className="text-slate-500 uppercase tracking-wider text-[10px]">HTTP</dt>
                        <dd className="text-slate-200 mt-1">
                          {result.url_meta.status_code ?? "—"}
                          {" · "}
                          {result.url_meta.ssl_valid ? "SSL ✓" : "SSL ✗"}
                          {" · "}
                          {result.url_meta.redirect_count} redirect
                        </dd>
                      </div>
                      {result.url_meta.final_url && result.url_meta.final_url !== result.url_meta.url && (
                        <div className="glass p-3 rounded-xl sm:col-span-2">
                          <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Final URL</dt>
                          <dd className="text-slate-200 break-all mt-1">{result.url_meta.final_url}</dd>
                        </div>
                      )}
                      {result.url_meta.fetch_error && (
                        <div className="glass p-3 rounded-xl sm:col-span-2">
                          <dt className="text-slate-500 uppercase tracking-wider text-[10px]">Fetch</dt>
                          <dd className="text-amber-300 mt-1">{result.url_meta.fetch_error}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {result.audio_result?.transcript && (
                  <div className="card p-5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs uppercase tracking-[0.12em] font-mono text-slate-400 flex items-center gap-2">
                        <ChatCircleDots size={15} weight="fill" className="text-blue-400" />
                        {t.transcript}
                      </h3>
                      {result.audio_result.language && (
                        <span className="badge badge-blue">{result.audio_result.language}</span>
                      )}
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-slate-700 pl-3.5">
                      {result.audio_result.transcript}
                    </p>
                  </div>
                )}

                {result.risk && !result.url_meta && (
                  <div className="card p-5 space-y-3">
                    <h3 className="text-xs uppercase tracking-[0.12em] font-mono text-slate-400 flex items-center gap-2">
                      <Sparkle size={15} weight="fill" className="text-blue-400" />
                      {t.weights}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        [t.llm, result.risk.weighted_intent_llm, "text-blue-400"],
                        [t.rules, result.risk.weighted_intent_rules, "text-orange-400"],
                        [t.audio, result.risk.weighted_audio, "text-emerald-400"],
                        [t.video, result.risk.weighted_video, "text-violet-400"],
                      ].map(([label, value, color]) => (
                        <div key={String(label)} className="glass p-3 rounded-xl">
                          <div className="text-[10px] uppercase tracking-[0.1em] font-mono text-slate-500">
                            {label}
                          </div>
                          <div className={`text-lg font-mono font-bold tabular-nums ${color}`}>
                            {((value as number) * 100).toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <FamilyGuard guidance={result?.family_guard ?? null} language={language} />

                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn-secondary" onClick={copySummary}>
                    {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                    {copied ? t.copied : t.copy_report}
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  );
}
