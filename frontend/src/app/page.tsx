"use client";

import { useCallback, useState } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScamChecker, { type CheckerMode, type Language } from "@/components/ScamChecker";
import HowItWorks from "@/components/HowItWorks";
import SecurityEducation from "@/components/SecurityEducation";
import Architecture from "@/components/Architecture";
import Footer from "@/components/Footer";

export default function ScamGuardPage() {
  const [lang, setLang] = useState<Language>("en");
  const [mode, setMode] = useState<CheckerMode>("text");

  const goChecker = useCallback(() => {
    setMode("text");
    requestAnimationFrame(() => {
      document.getElementById("checker")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const goLive = useCallback(() => {
    setMode("live");
    requestAnimationFrame(() => {
      document.getElementById("checker")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100 app-backdrop">
      <Navbar language={lang} setLanguage={setLang} onCtaClick={goChecker} />
      <main>
        <Hero language={lang} onCtaClick={goChecker} onLiveClick={goLive} />
        <ScamChecker language={lang} mode={mode} setMode={setMode} />
        <HowItWorks language={lang} />
        <SecurityEducation language={lang} />
        <Architecture language={lang} />
      </main>
      <Footer language={lang} />
    </div>
  );
}
