"use client";

import { useState, type FormEvent } from "react";
import { LockKey, Check, WarningCircle, X } from "@/components/icons";
import { useAccessCode } from "@/components/AccessCodeContext";

interface AccessCodeGateProps {
  language: "en" | "id";
}

const labels = {
  en: {
    title: "Demo protected",
    desc: "Enter the shared access code to use ScamGuard.",
    placeholder: "Access code",
    submit: "Submit",
    wrong: "That code was rejected. Please try again.",
    badge: "Demo protected",
  },
  id: {
    title: "Demo terproteksi",
    desc: "Masukkan kode akses bersama untuk menggunakan ScamGuard.",
    placeholder: "Kode akses",
    submit: "Kirim",
    wrong: "Kode itu ditolak. Silakan coba lagi.",
    badge: "Demo terproteksi",
  },
};

export function AccessCodeGate({ language }: AccessCodeGateProps) {
  const t = labels[language];
  const { accessCode, setAccessCode, gateOpen, closeGate, gateError } = useAccessCode();
  const [inputCode, setInputCode] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = inputCode.trim();
    if (!code) return;
    setAccessCode(code);
    setInputCode("");
  };

  /* ---- Modal ---- */
  if (gateOpen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-code-title"
      >
        {/* Backdrop — clicking it dismisses */}
        <button
          type="button"
          aria-label={language === "id" ? "Tutup" : "Close"}
          onClick={closeGate}
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        />

        <div className="glass-strong rounded-2xl w-full max-w-sm p-6 md:p-7 relative shadow-2xl">
          {/* Dismiss X */}
          <button
            type="button"
            onClick={closeGate}
            aria-label={language === "id" ? "Tutup" : "Close"}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 transition-colors focus-ring"
          >
            <X size={18} weight="bold" />
          </button>

          <div className="w-12 h-12 rounded-2xl glass-accent grid place-items-center mx-auto mb-4">
            <LockKey size={24} weight="fill" className="text-blue-400" />
          </div>

          <h2 id="access-code-title" className="text-base font-semibold text-white text-center">
            {t.title}
          </h2>
          <p className="mt-1.5 text-xs text-slate-400 text-center leading-relaxed">{t.desc}</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <label className="sr-only" htmlFor="access-code-input">
              {t.placeholder}
            </label>
            <input
              id="access-code-input"
              type="password"
              autoComplete="off"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder={t.placeholder}
              className="input-field text-center font-mono tracking-widest"
              autoFocus
            />

            {gateError && (
              <p role="alert" className="flex items-center justify-center gap-1.5 text-xs text-red-400">
                <WarningCircle size={14} weight="fill" />
                {t.wrong}
              </p>
            )}

            <button type="submit" disabled={!inputCode.trim()} className="btn-primary w-full">
              <Check size={16} weight="bold" />
              {t.submit}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ---- Closed: show a tiny badge when a code is stored ---- */
  if (!accessCode) return null;

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass text-[11px] font-mono uppercase tracking-[0.1em] text-slate-500">
      <LockKey size={12} weight="fill" />
      {t.badge}
    </span>
  );
}
