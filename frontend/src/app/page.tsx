"use client";

import { useCallback, useState } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ScamChecker, { type CheckerMode, type Language } from "@/components/ScamChecker";
import HowItWorks from "@/components/HowItWorks";
import SecurityEducation from "@/components/SecurityEducation";
import Architecture from "@/components/Architecture";
import FeedbackPanel from "@/components/FeedbackPanel";
import Footer from "@/components/Footer";

export default function ScamGuardPage() {
  const [lang, setLang] = useState<Language>("en");
  const [mode, setMode] = useState<CheckerMode>("text");

  const scrollToChecker = useCallback(() => {
    const el = document.getElementById("checker");
    if (!el) return;
    // Avoid smooth scroll on mobile; instant avoids fighting user touch scroll
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    el.scrollIntoView({ behavior: prefersReduced || isMobile ? "auto" : "smooth", block: "start" });
  }, []);

  const goChecker = useCallback(() => {
    setMode("text");
    requestAnimationFrame(scrollToChecker);
  }, [scrollToChecker]);

  const goLive = useCallback(() => {
    setMode("live");
    requestAnimationFrame(scrollToChecker);
  }, [scrollToChecker]);

  return (
    <div className="min-h-[100svh] bg-slate-950 text-slate-100 app-backdrop">
      <Navbar language={lang} setLanguage={setLang} onCtaClick={goChecker} />
      <main>
        <Hero language={lang} onCtaClick={goChecker} onLiveClick={goLive} />
        <ScamChecker language={lang} mode={mode} setMode={setMode} />
        <HowItWorks language={lang} />
        <SecurityEducation language={lang} />
        <Architecture language={lang} />
        <section id="feedback" className="py-16 md:py-24 px-4 md:px-8">
          <div className="max-w-4xl mx-auto">
            <FeedbackPanel language={lang} />
          </div>
        </section>
      </main>
      <Footer language={lang} />
    </div>
  );
}
