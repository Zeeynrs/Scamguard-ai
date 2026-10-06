"use client";

import { useState } from "react";
import {
  ShieldCheck,
  LockKey,
  UsersThree,
  Check,
  X,
  Sparkle,
} from "@/components/icons";
import { apiFetch } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Step = 1 | 2 | 3;

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  language: "en" | "id";
  onComplete: (familyId: string) => void;
}

export default function FamilyOnboardingModal({
  isOpen,
  onClose,
  language,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>(1);
  const [familyId, setFamilyId] = useState("");
  const [safeWord, setSafeWord] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTg, setContactTg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const t = {
    title: language === "id" ? "Setup Family Protection" : "Setup Family Protection",
    desc:
      language === "id"
        ? "Lindungi keluarga dari penipuan darurat dalam 3 langkah mudah."
        : "Protect your family from emergency scams in 3 easy steps.",
    step1Title: language === "id" ? "1. Tentukan Family ID" : "1. Choose a Family ID",
    step1Desc:
      language === "id"
        ? "ID unik untuk memisahkan data keluarga Anda. Hanya Anda dan keluarga yang tahu."
        : "A unique identifier to isolate your family data. Only known by you.",
    familyIdPlaceholder: language === "id" ? "mis. keluarga-wijaya" : "e.g. wijaya-family",
    step2Title: language === "id" ? "2. Tetapkan Kata Sandi Rahasia" : "2. Set a Safe Word",
    step2Desc:
      language === "id"
        ? "Jika ada telepon mengaku kecelakaan/polisi, minta kata sandi ini. Penipu tidak akan tahu."
        : "When someone calls claiming an emergency, ask for this secret word. Scammers won't know it.",
    safeWordPlaceholder: language === "id" ? "mis. mangga muda / naga biru" : "e.g. blue dragon",
    step3Title: language === "id" ? "3. Tambah Kontak Trust Circle" : "3. Add a Trust Circle Contact",
    step3Desc:
      language === "id"
        ? "Kontak keluarga yang akan di-ping otomatis saat verifikasi (opsional)."
        : "A family contact who will receive verification pings via Telegram (optional).",
    contactNamePlaceholder: language === "id" ? "mis. Ayah / Ibu / Budi" : "e.g. Mom / Dad / Alex",
    contactTgPlaceholder: "@username_telegram",
    next: language === "id" ? "Lanjut" : "Next",
    back: language === "id" ? "Kembali" : "Back",
    finish: language === "id" ? "Selesai & Aktifkan" : "Finish & Activate",
    quickDemo: language === "id" ? "⚡ Isi Cepat untuk Demo (1-Klik)" : "⚡ Quick Demo Auto-Fill (1-Click)",
  };

  const handleQuickDemo = async () => {
    const demoId = `demo-family-${Math.floor(1000 + Math.random() * 9000)}`;
    const demoWord = "mangga-manis-123";
    setFamilyId(demoId);
    setSafeWord(demoWord);
    setContactName("Budi Wijaya");
    setContactTg("budi_wijaya_demo");
    setLoading(true);
    setError(null);
    try {
      const headers = { "Content-Type": "application/json", "X-Family-Owner": demoId };
      await apiFetch(`${API_BASE}/api/family/safe-word`, {
        method: "POST",
        headers,
        body: JSON.stringify({ safe_word: demoWord }),
      });
      await apiFetch(`${API_BASE}/api/family/contacts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Budi Wijaya", telegram_username: "budi_wijaya_demo" }),
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("scamguard_family_owner", demoId);
      }
      onComplete(demoId);
      onClose();
    } catch {
      setError("Setup demo gagal, coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!familyId.trim()) {
      setError(language === "id" ? "Family ID wajib diisi" : "Family ID is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = { "Content-Type": "application/json", "X-Family-Owner": familyId.trim() };
      if (safeWord.trim()) {
        await apiFetch(`${API_BASE}/api/family/safe-word`, {
          method: "POST",
          headers,
          body: JSON.stringify({ safe_word: safeWord.trim() }),
        });
      }
      if (contactName.trim()) {
        await apiFetch(`${API_BASE}/api/family/contacts`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: contactName.trim(),
            telegram_username: contactTg.trim().replace(/^@/, ""),
          }),
        });
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("scamguard_family_owner", familyId.trim());
      }
      onComplete(familyId.trim());
      onClose();
    } catch {
      setError(language === "id" ? "Gagal menyimpan konfigurasi" : "Failed to save configuration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="card max-w-lg w-full p-6 space-y-5 border border-cyan-500/30 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X size={20} weight="bold" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-500/40 text-cyan-400">
            <ShieldCheck size={24} weight="fill" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">{t.title}</h2>
            <p className="text-xs text-slate-400">{t.desc}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`h-1 rounded-full ${step >= 1 ? "bg-cyan-400" : "bg-slate-800"}`} />
          <div className={`h-1 rounded-full ${step >= 2 ? "bg-cyan-400" : "bg-slate-800"}`} />
          <div className={`h-1 rounded-full ${step >= 3 ? "bg-cyan-400" : "bg-slate-800"}`} />
        </div>

        {/* Quick Demo Button */}
        <button
          type="button"
          disabled={loading}
          onClick={handleQuickDemo}
          className="w-full py-2 px-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-amber-300 hover:bg-amber-900/30 text-xs font-mono flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkle size={14} weight="fill" />
          {t.quickDemo}
        </button>

        {error && (
          <div className="p-2 rounded bg-red-950/50 border border-red-500/40 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Step 1: Family ID */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{t.step1Title}</h3>
              <p className="text-xs text-slate-400">{t.step1Desc}</p>
            </div>
            <input
              type="text"
              value={familyId}
              onChange={(e) => setFamilyId(e.target.value)}
              placeholder={t.familyIdPlaceholder}
              className="input-field h-10 text-sm"
              autoFocus
            />
          </div>
        )}

        {/* Step 2: Safe Word */}
        {step === 2 && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <LockKey size={16} className="text-cyan-400" />
                {t.step2Title}
              </h3>
              <p className="text-xs text-slate-400">{t.step2Desc}</p>
            </div>
            <input
              type="text"
              value={safeWord}
              onChange={(e) => setSafeWord(e.target.value)}
              placeholder={t.safeWordPlaceholder}
              className="input-field h-10 text-sm font-mono"
              autoFocus
            />
          </div>
        )}

        {/* Step 3: Contact */}
        {step === 3 && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <UsersThree size={16} className="text-cyan-400" />
                {t.step3Title}
              </h3>
              <p className="text-xs text-slate-400">{t.step3Desc}</p>
            </div>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={t.contactNamePlaceholder}
              className="input-field h-9 text-sm"
            />
            <input
              type="text"
              value={contactTg}
              onChange={(e) => setContactTg(e.target.value)}
              placeholder={t.contactTgPlaceholder}
              className="input-field h-9 text-sm font-mono"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          {step > 1 ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {t.back}
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && !familyId.trim()}
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="btn-primary text-xs px-4 py-2"
            >
              {t.next}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || !familyId.trim()}
              onClick={handleFinish}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
            >
              <Check size={14} weight="bold" />
              {t.finish}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}