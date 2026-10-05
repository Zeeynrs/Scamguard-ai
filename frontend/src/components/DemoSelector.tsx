"use client";

import { useState } from "react";
import { ArrowRight, Cpu } from "@/components/icons";

const DEMO_SCENARIOS: {
  id: "clean" | "gray" | "critical";
  enLabel: string;
  idLabel: string;
  enText: string;
  idText: string;
  expected: { tactics: string[]; level: string };
}[] = [
  {
    id: "clean",
    enLabel: "🧹 Clean — Meeting reminder",
    idLabel: "🧹 Bersih — Pengingat rapat",
    enText: "Hi, this is Alex from the office. Next week’s sync has been moved to 2:00 PM on Tuesday. Please confirm if you can make it. Thanks!",
    idText: "Halo Bu, ini Andi dari kantor. Jadi nanti rapat minggu depan dimajukan ke jam dua siang, mohon konfirmasi bisa hadir ya. Terima kasih.",
    expected: { tactics: [], level: "low" },
  },
  {
    id: "gray",
    enLabel: "⚠️ Suspicious — Prize lure asking for bank account",
    idLabel: "⚠️ Abu-abu — Hadiah minta data bank",
    enText: "Congratulations! You have been selected for our VIP rewards program. Claim your $2,000 gift card by submitting your full name and bank account details through this link before tomorrow’s deadline: https://rewards-claim-portal.vip/verify",
    idText: "Selamat! Anda terpilih sebagai pemenang program loyalitas kami. Hadiahnya voucher belanja 2 juta. Untuk klaim, silakan isi data diri dan nomor rekening di link berikut sebelum batas waktu besok.",
    expected: { tactics: ["urgency", "financial_demand", "reward_lure", "credential_harvest"], level: "high" },
  },
  {
    id: "critical",
    enLabel: "🚨 Critical — Police impersonation + ransom + OTP demand",
    idLabel: "🚨 Kritis — Polisi palsu + OTP + tebusan",
    enText: "Ma'am, this is Detective Harris from the metropolitan police. Your son was involved in an accident and is currently detained. Do not hang up, do not tell anyone. You must transfer $50,000 immediately to this secure legal escrow to drop the charges. We also need the OTP code from the SMS you just received.",
    idText: "Ibu, ini polisi. Anak Ibu baru kecelakaan dan sekarang ditahan. Jangan tutup teleponnya, jangan kasih tahu siapa-siapa. Segera transfer uang tebusan 50 juta ke rekening ini supaya anak Ibu bisa bebas. Kami butuh OTP dari SMS yang baru masuk juga.",
    expected: {
      tactics: ["urgency", "financial_demand", "authority_impersonation", "isolation_tactic", "credential_harvest"],
      level: "critical",
    },
  },
];

interface DemoSelectorProps {
  language: "en" | "id";
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export default function DemoSelector({ language, onSelect, disabled }: DemoSelectorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const t = {
    heading: language === "id" ? "Demo Skenario" : "Demo Scenarios",
    desc:
      language === "id"
        ? "Pilih skenario terkalibrasi — sistem langsung menganalisis dan menampilkan risiko."
        : "Pick a calibrated scenario — the system analyzes and shows risk outcome.",
    run: language === "id" ? "Jalankan" : "Run",
    tactic: language === "id" ? "Taktik" : "Tactic",
  };

  return (
    <section
      id="demo-scenarios"
      className="py-12 md:py-16 px-4 md:px-8 scroll-mt-24"
      aria-label={t.heading}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <Cpu size={18} weight="duotone" className="text-purple-400" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] font-mono text-slate-300">
            {t.heading}
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-6 max-w-lg">{t.desc}</p>

        {/* Scenario cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DEMO_SCENARIOS.map((sc) => {
            const isActive = activeId === sc.id;
            const label = language === "id" ? sc.idLabel : sc.enLabel;
            const [emoji, ...rest] = label.split(" ");

            return (
              <div
                key={sc.id}
                className={`glass rounded-2xl p-5 border transition-all cursor-pointer ${
                  isActive
                    ? "border-blue-500/60 shadow-lg shadow-blue-500/15"
                    : "border-slate-800/40 hover:border-slate-700/60"
                }`}
                onClick={() => setActiveId(sc.id)}
                role="option"
                aria-selected={isActive}
              >
                <h3 className="text-sm font-semibold text-white mb-1">{label}</h3>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed mb-3">
                  {`"${(language === "id" ? sc.idText : sc.enText).length > 120 ? (language === "id" ? sc.idText : sc.enText).slice(0, 120) + "…" : (language === "id" ? sc.idText : sc.enText)}"`}
                </p>

                {/* Expected outcome hint */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                  <span
                    className={`badge text-[10px] font-mono uppercase ${
                      sc.expected.level === "critical"
                        ? "badge-critical"
                        : sc.expected.level === "high"
                          ? "badge-high"
                          : sc.expected.level === "medium"
                            ? "badge-medium"
                            : "badge-low"
                    }`}
                  >
                    {sc.expected.level}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {sc.expected.tactics.length > 0
                      ? `${sc.expected.tactics.length} ${t.tactic.toLowerCase()}`
                      : `0 ${t.tactic.toLowerCase()}`}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveId(sc.id);
                    onSelect(language === "id" ? sc.idText : sc.enText);
                  }}
                  disabled={disabled}
                  className={`btn-primary w-full text-xs ${
                    !isActive ? "opacity-70 hover:opacity-100" : ""
                  }`}
                >
                  <ArrowRight size={14} weight="bold" />
                  {t.run}
                </button>
              </div>
            );
          })}
        </div>

        {/* Show selected preview */}
        {activeId && (
          <div className="mt-4 p-4 rounded-xl glass border border-blue-500/20">
            <p className="text-xs font-mono text-slate-400 mb-1">
              {language === "id" ? "Teks demo terpilih:" : "Selected demo text:"}
            </p>
            <p className="text-sm text-slate-200 leading-relaxed break-words">
              {(() => {
                const sc = DEMO_SCENARIOS.find((s) => s.id === activeId);
                return sc ? (language === "id" ? sc.idText : sc.enText) : "";
              })()}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}