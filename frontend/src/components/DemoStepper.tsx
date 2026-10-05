"use client";

import { useState } from "react";
import { ArrowRight, Sparkle } from "@/components/icons";

export interface DemoStep {
  id: "clean" | "gray" | "critical";
  stepNumber: number;
  enTitle: string;
  idTitle: string;
  enTagline: string;
  idTagline: string;
  enText: string;
  idText: string;
  expectedLevel: "low" | "high" | "critical";
  expectedTactics: string[];
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "clean",
    stepNumber: 1,
    enTitle: "Clean Office Call",
    idTitle: "Panggilan Kantor Bersih",
    enTagline: "Normal business meeting reschedule. No financial demand or pressure.",
    idTagline: "Jadwal ulang rapat biasa. Tanpa permintaan uang atau tekanan.",
    enText: "Hi, this is Alex from the office. Next week’s sync has been moved to 2:00 PM on Tuesday. Please confirm if you can make it. Thanks!",
    idText: "Halo Bu, ini Andi dari kantor. Jadi nanti rapat minggu depan dimajukan ke jam dua siang, mohon konfirmasi bisa hadir ya. Terima kasih.",
    expectedLevel: "low",
    expectedTactics: [],
  },
  {
    id: "gray",
    stepNumber: 2,
    enTitle: "Suspicious Prize Lure",
    idTitle: "Iming-iming Hadiah Palsu",
    enTagline: "VIP reward asking for banking info before a tight deadline.",
    idTagline: "Hadiah voucher meminta data rekening sebelum batas waktu ketat.",
    enText: "Congratulations! You have been selected for our VIP rewards program. Claim your $2,000 gift card by submitting your full name and bank account details through this link before tomorrow’s deadline: https://rewards-claim-portal.vip/verify",
    idText: "Selamat! Anda terpilih sebagai pemenang program loyalitas kami. Hadiahnya voucher belanja 2 juta. Untuk klaim, silakan isi data diri dan nomor rekening di link berikut sebelum batas waktu besok.",
    expectedLevel: "high",
    expectedTactics: ["urgency", "financial_demand", "reward_lure", "credential_harvest"],
  },
  {
    id: "critical",
    stepNumber: 3,
    enTitle: "Critical Police Impersonation",
    idTitle: "Polisi Palsu & Tebusan Kritis",
    enTagline: "Fake authority, fake accident, ransom demand, and SMS OTP theft.",
    idTagline: "Otoritas palsu, kabar kecelakaan, tebusan kilat, dan pencurian OTP.",
    enText: "Ma'am, this is Detective Harris from the metropolitan police. Your son was involved in an accident and is currently detained. Do not hang up, do not tell anyone. You must transfer $50,000 immediately to this secure legal escrow to drop the charges. We also need the OTP code from the SMS you just received.",
    idText: "Ibu, ini polisi. Anak Ibu baru kecelakaan dan sekarang ditahan. Jangan tutup teleponnya, jangan kasih tahu siapa-siapa. Segera transfer uang tebusan 50 juta ke rekening ini supaya anak Ibu bisa bebas. Kami butuh OTP dari SMS yang baru masuk juga.",
    expectedLevel: "critical",
    expectedTactics: ["authority_impersonation", "coercive_isolation", "financial_demand", "credential_harvest", "urgency"],
  },
];

interface DemoStepperProps {
  language: "en" | "id";
  activeStep: number; // 0, 1, 2
  onSelectStep: (stepIndex: number, text: string) => void;
  disabled?: boolean;
}

export default function DemoStepper({
  language,
  activeStep,
  onSelectStep,
  disabled,
}: DemoStepperProps) {
  const current = DEMO_STEPS[activeStep] || DEMO_STEPS[0];

  const t = {
    badge: language === "id" ? "PANDUAN DEMO LIVE" : "LIVE DEMO STORYBOARD",
    step: language === "id" ? "Skenario" : "Scenario",
    of: language === "id" ? "dari" : "of",
    loadScenario: language === "id" ? "Muat ke Analisis" : "Load Scenario",
    activeLabel: language === "id" ? "Sedang Aktif" : "Active Scenario",
    expectedOutcome: language === "id" ? "Ekspektasi Output:" : "Expected Outcome:",
    tactics: language === "id" ? "taktik terdeteksi" : "tactics flagged",
  };

  return (
    <div className="mb-8 p-1 rounded-2xl bg-gradient-to-b from-slate-800/80 via-slate-900/60 to-slate-950/80 border border-slate-800/90 shadow-2xl backdrop-blur-xl">
      {/* Top bar with step indicators */}
      <div className="p-4 sm:p-5 bg-slate-950/60 rounded-xl border border-slate-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Sparkle size={12} weight="fill" />
              {t.badge}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {t.step} {activeStep + 1} {t.of} {DEMO_STEPS.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {DEMO_STEPS.map((s, idx) => {
              const isSelected = activeStep === idx;
              const isPassed = activeStep > idx;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectStep(idx, language === "id" ? s.idText : s.enText)}
                  disabled={disabled}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 focus-ring ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-400"
                      : isPassed
                        ? "bg-slate-800 text-slate-300 hover:bg-slate-750"
                        : "bg-slate-900/60 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono ${
                      isSelected
                        ? "bg-white text-blue-700 font-bold"
                        : isPassed
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isPassed ? "✓" : s.stepNumber}
                  </span>
                  <span className="hidden md:inline">
                    {language === "id" ? s.idTitle.split(" ")[0] : s.enTitle.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Current Active Card details */}
        <div className="grid md:grid-cols-12 gap-4 items-center bg-slate-900/40 rounded-xl p-4 border border-slate-800/40">
          <div className="md:col-span-8 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  current.expectedLevel === "critical"
                    ? "bg-red-400"
                    : current.expectedLevel === "high"
                      ? "bg-orange-400"
                      : "bg-emerald-400"
                }`}
              />
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {language === "id" ? current.idTitle : current.enTitle}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {language === "id" ? current.idTagline : current.enTagline}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-mono text-slate-400">
                {t.expectedOutcome}
              </span>
              <span
                className={`badge text-[10px] font-mono font-bold uppercase ${
                  current.expectedLevel === "critical"
                    ? "badge-critical"
                    : current.expectedLevel === "high"
                      ? "badge-high"
                      : "badge-low"
                }`}
              >
                {current.expectedLevel} risk
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                • {current.expectedTactics.length} {t.tactics}
              </span>
            </div>
          </div>

          <div className="md:col-span-4 flex md:justify-end">
            <button
              type="button"
              onClick={() => onSelectStep(activeStep, language === "id" ? current.idText : current.enText)}
              disabled={disabled}
              className="btn-primary w-full md:w-auto text-xs py-2.5 px-4 shadow-lg shadow-blue-600/30 group"
            >
              <span>{t.loadScenario}</span>
              <ArrowRight
                size={14}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
