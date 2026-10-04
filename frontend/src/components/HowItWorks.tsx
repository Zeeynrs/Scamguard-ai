"use client";

import {
  ChatCircleText,
  Cpu,
  ChartLineUp,
  ShieldCheck,
  ArrowRight,
} from "@/components/icons";

type Language = "en" | "id";

const copy = {
  en: {
    kicker: "How it works",
    title: "From suspicious content to a clear next step",
    subtitle:
      "ScamGuard scores available signals. It does not guarantee detection. Treat every result as an advisory, then verify independently.",
    steps: [
      {
        n: "01",
        title: "Submit",
        body: "Paste a message, URL, email, or upload a voice note. Live Call Monitor watches an active session.",
        Icon: ChatCircleText,
      },
      {
        n: "02",
        title: "Analyze",
        body: "Heuristic patterns plus LLM intent scoring, with optional audio and video deepfake signals when present.",
        Icon: Cpu,
      },
      {
        n: "03",
        title: "Understand",
        body: "A calibrated risk level, the tactics that fired, quoted evidence, and why the score moved.",
        Icon: ChartLineUp,
      },
      {
        n: "04",
        title: "Act safely",
        body: "Follow the recommended action. Do not click, pay, or share OTP until you verify through an official channel.",
        Icon: ShieldCheck,
      },
    ],
  },
  id: {
    kicker: "Cara kerja",
    title: "Dari konten mencurigakan ke langkah yang jelas",
    subtitle:
      "ScamGuard menilai sinyal yang tersedia. Bukan jaminan deteksi. Anggap setiap hasil sebagai saran, lalu verifikasi sendiri.",
    steps: [
      {
        n: "01",
        title: "Kirim",
        body: "Tempel pesan, URL, email, atau unggah voice note. Live Call Monitor mengawasi sesi aktif.",
        Icon: ChatCircleText,
      },
      {
        n: "02",
        title: "Analisis",
        body: "Pola heuristik plus skor intent LLM, dengan sinyal deepfake audio dan video jika ada.",
        Icon: Cpu,
      },
      {
        n: "03",
        title: "Pahami",
        body: "Level risiko terkalibrasi, taktik yang terpicu, kutipan bukti, dan alasan skor bergerak.",
        Icon: ChartLineUp,
      },
      {
        n: "04",
        title: "Bertindak aman",
        body: "Ikuti rekomendasi. Jangan klik, bayar, atau bagikan OTP sebelum verifikasi lewat kanal resmi.",
        Icon: ShieldCheck,
      },
    ],
  },
};

export default function HowItWorks({ language }: { language: Language }) {
  const t = copy[language];

  return (
    <section id="how" className="scroll-mt-24 py-16 md:py-24">
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

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {t.steps.map((step, i) => {
            const Icon = step.Icon;
            return (
              <li key={step.n} className="relative">
                <article className="h-full card p-5 md:p-6 hover:border-slate-700 transition-colors duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl glass-accent grid place-items-center">
                      <Icon size={20} weight="duotone" className="text-blue-400" />
                    </div>
                    <span className="font-mono text-xs text-slate-500">{step.n}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.body}</p>
                </article>
                {i < t.steps.length - 1 && (
                  <ArrowRight
                    size={16}
                    className="hidden lg:block absolute top-1/2 -right-3 text-slate-700 -translate-y-1/2"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
