"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Shield,
  Warning,
  Cpu,
  Waveform,
  VideoCamera,
  ArrowRight,
  Pulse,
  CheckCircle,
} from "@/components/icons";

const translations = {
  en: {
    badge: "Live Protection Active",
    headline: "Detect scams before they cost you.",
    subheadline:
      "Real-time multimodal analysis of suspicious messages, links, and calls using AI-powered voice, text, and video understanding.",
    cta_primary: "Check for Scams",
    cta_secondary: "Live Call Monitor",
    metric1: "4 Risk Levels",
    metric2: "3 Analysis Modes",
    metric3: "7 Scam Tactics",
    metric4: "Bilingual Support",
    visual_title: "Analysis Engine",
    visual_sub: "Multi-signal risk assessment",
    visual_incoming: "Analyzing: 'Bank OTP request...'",
    visual_score: "Risk Score",
    visual_level: "HIGH RISK",
    visual_tactics: "Detected Tactics",
    visual_confidence: "Confidence",
  },
  id: {
    badge: "Perlindungan Aktif",
    headline: "Deteksi penipuan sebelum menyerangmu.",
    subheadline:
      "Analisis multimodal real-time terhadap pesan, tautan, dan panggilan mencurigakan menggunakan AI untuk suara, teks, dan video.",
    cta_primary: "Cek Scam",
    cta_secondary: "Monitor Panggilan",
    metric1: "4 Level Risiko",
    metric2: "3 Mode Analisis",
    metric3: "7 Taktik Scam",
    metric4: "Dukungan Bilingual",
    visual_title: "Mesin Analisis",
    visual_sub: "Penilaian risiko multi-sinyal",
    visual_incoming: "Menganalisis: 'Bank OTP request...'",
    visual_score: "Skor Risiko",
    visual_level: "RISIKO TINGGI",
    visual_tactics: "Taktik Terdeteksi",
    visual_confidence: "Tingkat Percaya",
  },
};

type Language = "en" | "id";

interface HeroProps {
  language: Language;
  onCtaClick: () => void;
  onLiveClick: () => void;
}

// Animated risk visualization component
function ThreatVisual({ language }: { language: Language }) {
  const t = translations[language];
  const [scanProgress, setScanProgress] = useState(0);
  const [tacticIndex, setTacticIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(true);

  const tactics =
    language === "en"
      ? ["Urgency pressure", "Authority fake", "Credential harvest"]
      : ["Tekanan waktu", "Pura-pura otoritas", "Pencurian OTP"];

  useEffect(() => {
    if (!isScanning) return;

    const interval = setInterval(() => {
      setScanProgress((p) => {
        if (p >= 100) {
          setIsScanning(false);
          return 100;
        }
        return p + 5;
      });
    }, 80);

    return () => clearInterval(interval);
  }, [isScanning]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTacticIndex((i) => (i + 1) % tactics.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [tactics.length]);

  // Reset animation loop
  useEffect(() => {
    const resetInterval = setInterval(() => {
      setScanProgress(0);
      setIsScanning(true);
    }, 8000);
    return () => clearInterval(resetInterval);
  }, []);

  const riskScore = Math.min(87, Math.floor(scanProgress * 0.87));
  const showTactics = scanProgress > 40;

  return (
    <div
      className="relative w-full max-w-md glass-strong rounded-3xl p-6 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-700 delay-300"
      role="img"
      aria-label={`${t.visual_title}: ${t.visual_sub}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg glass-accent grid place-items-center">
            <Cpu size={16} weight="duotone" className="text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{t.visual_title}</div>
            <div className="text-[10px] text-slate-500">{t.visual_sub}</div>
          </div>
        </div>
        <div
          className={`w-2.5 h-2.5 rounded-full animate-pulse ${
            isScanning ? "bg-blue-400" : "bg-emerald-400"
          }`}
          aria-hidden="true"
        />
      </div>

      {/* Scan Input */}
      <div className="mb-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <Pulse size={12} weight="bold" className="text-blue-400 animate-pulse" />
          {t.visual_incoming}
        </div>
        <div className="flex items-center gap-1.5">
          {isScanning ? (
            <>
              <Waveform size={14} weight="bold" className="text-blue-400" />
              <span className="text-xs text-slate-300 font-mono">
                {t.visual_incoming.slice(11)}
              </span>
            </>
          ) : (
            <>
              <CheckCircle size={14} weight="fill" className="text-emerald-400" />
              <span className="text-xs text-slate-300 font-mono truncate">
                {t.visual_incoming.slice(11)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-400">{t.visual_score}</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              riskScore > 60 ? "text-red-400" : riskScore > 30 ? "text-yellow-400" : "text-emerald-400"
            }`}
            aria-label={`${t.visual_score}: ${riskScore}%`}
          >
            {riskScore}%
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-red-500 rounded-full transition-all duration-100 ease-out"
            style={{ width: `${riskScore}%` }}
          />
        </div>
        {riskScore > 60 && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold uppercase tracking-wide">
            <Warning size={12} weight="fill" />
            {t.visual_level}
          </div>
        )}
      </div>

      {/* Detected Tactics */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-mono mb-2">
          {t.visual_tactics}
        </div>
        <div className="flex flex-wrap gap-2 min-h-[64px] content-start">
          {showTactics &&
            tactics.slice(0, tacticIndex + 1).map((tactic, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full glass text-xs text-slate-300 animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                {tactic}
              </span>
            ))}
          {showTactics && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold animate-in fade-in zoom-in-95 duration-300">
              <CheckCircle size={10} weight="fill" className="inline mr-1" />
              {language === "en" ? "3 signals" : "3 sinyal"}
            </span>
          )}
        </div>
      </div>

      {/* Decorative corner elements */}
      <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-blue-500/50 rounded-tl-xl" aria-hidden="true" />
      <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-emerald-500/50 rounded-tr-xl" aria-hidden="true" />
      <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-red-500/50 rounded-bl-xl" aria-hidden="true" />
      <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-yellow-500/50 rounded-br-xl" aria-hidden="true" />
    </div>
  );
}

export default function Hero({ language, onCtaClick, onLiveClick }: HeroProps) {
  const t = translations[language];
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStatsVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const stats = [
    { label: t.metric1, value: "4" },
    { label: t.metric2, value: "3" },
    { label: t.metric3, value: "7" },
    { label: t.metric4, value: "2" },
  ];

  return (
    <section
      className="relative pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden"
      aria-label="Hero"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full bg-gradient-to-br from-blue-600/10 via-transparent to-emerald-600/5 blur-3xl" />
        <div className="absolute top-1/4 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Text Content */}
          <div className="space-y-6 md:space-y-8">
            {/* Status Badge */}
            <div className="animate-in fade-in slide-in-from-top-3 duration-500">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-semibold text-emerald-300 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                <Shield size={12} weight="fill" />
                {t.badge}
              </div>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
              {t.headline}
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-slate-400 max-w-lg leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              {t.subheadline}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <button
                onClick={onCtaClick}
                className="btn-primary text-base px-8 py-3.5 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all duration-200"
                aria-label={t.cta_primary}
              >
                <ShieldCheck size={18} weight="bold" />
                {t.cta_primary}
              </button>
              <button
                onClick={onLiveClick}
                className="btn-secondary text-base px-8 py-3.5 hover:bg-slate-700/80 transition-all duration-200"
                aria-label={t.cta_secondary}
              >
                <VideoCamera size={18} weight="duotone" className="text-blue-400" />
                {t.cta_secondary}
              </button>
            </div>

            {/* Stats */}
            <div
              className={`grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-800/50 transition-opacity duration-700 ${
                statsVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              {stats.map((stat, i) => (
                <div
                  key={i}
                  className="text-center sm:text-left space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-500"
                  style={{ animationDelay: `${400 + i * 100}ms` }}
                >
                  <div className="text-2xl md:text-3xl font-bold text-white tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Visual */}
          <div className="flex justify-center lg:justify-end">
            <ThreatVisual language={language} />
          </div>
        </div>
      </div>
    </section>
  );
}
