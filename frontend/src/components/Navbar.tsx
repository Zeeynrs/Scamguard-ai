"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CaretDown,
  GithubLogo,
  Pulse,
  ListChecks,
  X,
} from "@/components/icons";

const translations = {
  en: {
    nav_checker: "Scam Checker",
    nav_how: "How It Works",
    nav_education: "Security Education",
    nav_architecture: "Architecture",
    cta: "Check a Scam",
    live_badge: "Live monitor",
    language: "Language",
  },
  id: {
    nav_checker: "Pengecek Scam",
    nav_how: "Cara Kerja",
    nav_education: "Pendidikan Keamanan",
    nav_architecture: "Arsitektur",
    cta: "Cek Scam",
    live_badge: "Monitor live",
    language: "Bahasa",
  },
};

type Language = "en" | "id";

interface NavbarProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  onCtaClick: () => void;
}

export default function Navbar({
  language,
  setLanguage,
  onCtaClick,
}: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [liveActive, setLiveActive] = useState(false);

  // Track scroll position for backdrop transition
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Animate live badge pulse
  useEffect(() => {
    const interval = setInterval(() => setLiveActive((p) => !p), 1500);
    return () => clearInterval(interval);
  }, []);

  const t = translations[language];

  const navLinks = [
    { id: "checker", label: t.nav_checker },
    { id: "how", label: t.nav_how },
    { id: "education", label: t.nav_education },
    { id: "architecture", label: t.nav_architecture },
  ] as const;

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isMobile = window.innerWidth < 768;
      el.scrollIntoView({
        behavior: prefersReduced || isMobile ? "auto" : "smooth",
        block: "start",
      });
    }
    setMobileOpen(false);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass-strong shadow-xl"
          : "glass bg-transparent"
      }`}
      role="banner"
    >
      <nav
        className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({
              top: 0,
              behavior: window.innerWidth < 768 ? "auto" : "smooth",
            });
          }}
          className="flex items-center gap-2.5 shrink-0 focus-ring rounded-xl px-2 py-1 hover:bg-slate-800/50 transition-colors"
          aria-label="ScamGuard Home"
        >
          <div className="w-9 h-9 rounded-xl glass-accent grid place-items-center">
            <ShieldCheck size={20} weight="duotone" className="text-blue-400" />
          </div>
          <span className="hidden sm:block font-bold text-white tracking-tight text-lg">
            ScamGuard
          </span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all duration-200 focus-ring"
              aria-label={label}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Live Monitor Indicator */}
          <button
            onClick={() => scrollToSection("live-monitor")}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-all"
            aria-label={t.live_badge}
          >
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                liveActive ? "bg-emerald-400" : "bg-emerald-600"
              }`}
              aria-hidden="true"
            />
            <Pulse size={12} weight="fill" className="text-emerald-400" />
            <span>{t.live_badge}</span>
          </button>

          {/* Language Selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all focus-ring"
              aria-expanded={showLangDropdown}
              aria-haspopup="listbox"
              aria-label={t.language}
            >
              <span className="uppercase tracking-wide">
                {language === "en" ? "EN" : "ID"}
              </span>
              <CaretDown size={14} weight="bold" />
            </button>

            {showLangDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowLangDropdown(false)}
                  aria-hidden="true"
                />
                <ul
                  className="absolute right-0 mt-2 w-32 glass-strong rounded-xl border border-slate-700/50 py-1 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  role="listbox"
                  aria-label={t.language}
                >
                  {(["en", "id"] as Language[]).map((l) => (
                    <li key={l} role="option" aria-selected={language === l}>
                      <button
                        onClick={() => {
                          setLanguage(l);
                          setShowLangDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm font-medium transition-colors ${
                          language === l
                            ? "bg-blue-600/20 text-blue-300"
                            : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                        }`}
                      >
                        {l.toUpperCase()}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg glass text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all focus-ring"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X size={22} weight="bold" />
            ) : (
              <ListChecks size={22} weight="bold" />
            )}
          </button>

          {/* CTA Button */}
          <button
            onClick={onCtaClick}
            className="btn-primary hidden sm:flex"
            aria-label={t.cta}
          >
            <ShieldCheck size={16} weight="bold" />
            {t.cta}
          </button>

          {/* GitHub Link */}
          <a
            href="https://github.com/Zeeynrs/Scamguard-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all focus-ring"
            aria-label="View on GitHub"
          >
            <GithubLogo size={16} weight="bold" />
            <span>GitHub</span>
          </a>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden absolute top-16 left-0 right-0 glass-strong border-t border-slate-800/50 px-4 pb-4 animate-in slide-in-from-top-2 fade-in duration-300"
          role="navigation"
          aria-label="Mobile navigation"
        >
          <div className="space-y-1 pt-2">
            {navLinks.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className="w-full px-4 py-3 rounded-xl text-left text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all focus-ring"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pt-4 border-t border-slate-800/30 flex flex-col gap-2">
            <div className="flex gap-2">
              {(["en", "id"] as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setLanguage(l);
                    setShowLangDropdown(false);
                  }}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    language === l
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "glass text-slate-300 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={onCtaClick}
              className="btn-primary justify-center"
            >
              <ShieldCheck size={16} weight="bold" />
              {t.cta}
            </button>
            <a
              href="https://github.com/Zeeynrs/Scamguard-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl glass text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all focus-ring"
            >
              <GithubLogo size={16} weight="bold" />
              GitHub
            </a>
          </div>
        </div>
      )}
    </header>
  );
}