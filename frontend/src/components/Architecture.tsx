"use client";

import { Cpu, Waveform, VideoCamera, Lightning } from "@/components/icons";

type Language = "en" | "id";

const copy = {
  en: {
    kicker: "Architecture",
    title: "Four signals, one calibrated score",
    subtitle:
      "Fusion weights used by the current backend. Audio and video only move the score when those modalities are present.",
    signals: [
      {
        label: "LLM intent",
        weight: "55%",
        body: "Language model scores whether the text shows scam intent.",
        Icon: Cpu,
      },
      {
        label: "Heuristic rules",
        weight: "25%",
        body: "Pattern matches for urgency, OTP harvest, authority, isolation, lures.",
        Icon: Lightning,
      },
      {
        label: "Audio",
        weight: "12%",
        body: "Voice-note transcription plus audio deepfake indications when uploaded or live.",
        Icon: Waveform,
      },
      {
        label: "Video",
        weight: "8%",
        body: "Face / deepfake signals from live call frames. Unused on text-only checks.",
        Icon: VideoCamera,
      },
    ],
    note: "Weights are product configuration, not a published academic benchmark. Scores are indicative.",
  },
  id: {
    kicker: "Arsitektur",
    title: "Empat sinyal, satu skor terkalibrasi",
    subtitle:
      "Bobot fusi yang dipakai backend saat ini. Audio dan video hanya menggeser skor jika modalitas itu ada.",
    signals: [
      {
        label: "Intent LLM",
        weight: "55%",
        body: "Model bahasa menilai apakah teks menunjukkan niat scam.",
        Icon: Cpu,
      },
      {
        label: "Aturan heuristik",
        weight: "25%",
        body: "Pola urgensi, panen OTP, otoritas, isolasi, iming-iming.",
        Icon: Lightning,
      },
      {
        label: "Audio",
        weight: "12%",
        body: "Transkrip voice note plus indikasi deepfake audio saat unggah atau live.",
        Icon: Waveform,
      },
      {
        label: "Video",
        weight: "8%",
        body: "Sinyal wajah / deepfake dari frame panggilan live. Tidak dipakai pada cek teks saja.",
        Icon: VideoCamera,
      },
    ],
    note: "Bobot adalah konfigurasi produk, bukan patokan akademik. Skor bersifat indikatif.",
  },
};

export default function Architecture({ language }: { language: Language }) {
  const t = copy[language];

  return (
    <section id="architecture" className="scroll-mt-24 py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <header className="max-w-2xl mb-10 md:mb-14">
          <p className="text-xs font-mono uppercase tracking-[0.16em] text-blue-400 mb-3">
            {t.kicker}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            {t.title}
          </h2>
          <p className="mt-3 text-slate-400 leading-relaxed">{t.subtitle}</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.signals.map((s) => {
            const Icon = s.Icon;
            return (
              <article key={s.label} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl glass-accent grid place-items-center">
                    <Icon size={20} weight="duotone" className="text-blue-400" />
                  </div>
                  <span className="font-mono text-lg font-bold text-white tabular-nums">
                    {s.weight}
                  </span>
                </div>
                <h3 className="font-semibold text-white mb-1.5">{s.label}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.body}</p>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-xs text-slate-500 max-w-3xl leading-relaxed">{t.note}</p>
      </div>
    </section>
  );
}
