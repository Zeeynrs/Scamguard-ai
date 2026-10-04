"use client";

import { ShieldCheck, GithubLogo } from "@/components/icons";

type Language = "en" | "id";

const copy = {
  en: {
    blurb:
      "Multimodal scam-risk signals for messages, voice notes, and live calls. Indicative, not a guarantee.",
    product: "Product",
    checker: "Scam Checker",
    how: "How it works",
    education: "Security education",
    architecture: "Architecture",
    source: "Source",
    github: "GitHub repository",
    disclosure:
      "Runs on-prem. LLM and speech via Groq. Do not paste secrets you cannot afford to expose.",
    copyright: "ScamGuard Multimodal",
  },
  id: {
    blurb:
      "Sinyal risiko scam multimodal untuk pesan, voice note, dan panggilan live. Indikatif, bukan jaminan.",
    product: "Produk",
    checker: "Pengecek scam",
    how: "Cara kerja",
    education: "Pendidikan keamanan",
    architecture: "Arsitektur",
    source: "Sumber",
    github: "Repositori GitHub",
    disclosure:
      "Berjalan on-prem. LLM dan speech lewat Groq. Jangan tempel rahasia yang tidak boleh terpapar.",
    copyright: "ScamGuard Multimodal",
  },
};

export default function Footer({ language }: { language: Language }) {
  const t = copy[language];

  const scroll = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <footer className="border-t border-slate-800/60 mt-8">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={20} weight="duotone" className="text-blue-400" />
            <span className="font-bold text-white">ScamGuard</span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed max-w-sm">{t.blurb}</p>
        </div>

        <div>
          <p className="text-xs font-mono uppercase tracking-[0.14em] text-slate-500 mb-3">
            {t.product}
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <button onClick={() => scroll("checker")} className="text-slate-300 hover:text-white focus-ring rounded">
                {t.checker}
              </button>
            </li>
            <li>
              <button onClick={() => scroll("how")} className="text-slate-300 hover:text-white focus-ring rounded">
                {t.how}
              </button>
            </li>
            <li>
              <button onClick={() => scroll("education")} className="text-slate-300 hover:text-white focus-ring rounded">
                {t.education}
              </button>
            </li>
            <li>
              <button onClick={() => scroll("architecture")} className="text-slate-300 hover:text-white focus-ring rounded">
                {t.architecture}
              </button>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-mono uppercase tracking-[0.14em] text-slate-500 mb-3">
            {t.source}
          </p>
          <a
            href="https://github.com/Zeeynrs/Scamguard-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white focus-ring rounded"
          >
            <GithubLogo size={16} weight="bold" />
            {t.github}
          </a>
          <p className="mt-4 text-xs text-slate-500 leading-relaxed">{t.disclosure}</p>
        </div>
      </div>
      <div className="border-t border-slate-800/40">
        <p className="max-w-7xl mx-auto px-4 md:px-8 py-4 text-[11px] text-slate-600 font-mono">
          {t.copyright}
        </p>
      </div>
    </footer>
  );
}
