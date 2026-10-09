"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LockKey,
  UsersThree,
  UserPlus,
  UserMinus,
  Broadcast,
  BellRinging,
  Check,
  X,
  Password,
  Sparkle,
} from "@/components/icons";
import { apiFetch } from "@/lib/api";
import FamilyOnboardingModal from "@/components/FamilyOnboardingModal";

// -------------------------------------------------------
// Types
// -------------------------------------------------------
export interface ReplyScript {
  tactic: string;
  title: string;
  say: string;
  avoid: string;
  why: string;
}

export interface FamilyGuardGuidance {
  safe_word_challenge: string;
  reply_scripts: ReplyScript[];
  verify_actions: string[];
  safe_word_check_passed?: boolean;
}

interface Contact {
  id: string;
  owner: string;
  name: string;
  telegram_username: string;
  /** True when the backend holds a deliverable chat_id (contact has /start-ed the bot). */
  ping_ready?: boolean;
}

interface Ping {
  id: string;
  owner: string;
  claim: string;
  status: string;
  created_at: number;
  scammer_name?: string;
  scammer_handle?: string;
  scammer_channel?: string;
  threat_type?: string;
  amount_requested?: string;
  location?: string;
  notes?: string;
  risk_level?: string;
  evidence_url?: string;
}

// -------------------------------------------------------
// Labels
// -------------------------------------------------------
const labels = {
  en: {
    title: "Family Protection",
    desc: "Verify identity before acting — safe word, trust circle, and guided replies.",
    safeWord: "Safe Word",
    safeWordSet: "Set a family safe word",
    safeWordSetDesc: "When someone calls claiming an emergency, ask for this word.",
    safeWordCheck: "Check safe word",
    safeWordPassed: "Safe word verified",
    safeWordFailed: "Wrong safe word",
    verifyBtn: "Verify",
    trustCircle: "Trust Circle",
    trustCircleDesc: "Family members who can cross-verify emergency claims.",
    addContact: "Add contact",
    contactName: "Name",
    contactUser: "Telegram username",
    addBtn: "Add",
    pings: "Verification Pings",
    pingDesc: "Cross-verify: send a ping to your Trust Circle to confirm identity.",
    createPing: "Ping Family",
    pingClaim: "What are they claiming?",
    sendPing: "Send",
    pingDetails: "Details (optional)",
    pingScammerName: "Scammer name / alias",
    pingScammerHandle: "Phone / @username",
    pingChannel: "Channel (WA, call, IG, SMS…)",
    pingThreat: "Scam type (romance, fake bank, OTP…)",
    pingAmount: "Amount / account requested",
    pingLocation: "Victim location",
    pingNotes: "Extra notes",
    pingRisk: "Risk level",
    pingEvidence: "Evidence URL (recording/screenshot)",
    riskCritical: "Critical",
    riskHigh: "High",
    riskMedium: "Medium",
    riskLow: "Low",
    realIdentity: "Real identity",
    impostor: "Impostor",
    noContacts: "No contacts. Add family members first.",
    noPings: "No pending pings.",
    replyScripts: "What to say",
    scriptsDesc: "Guided replies based on the tactics detected in this call.",
    verifyActions: "Immediate actions",
    configureFirst: "Configure a safe word and add family members to activate Family Protection.",
    noGuidance: "No specific guidance for this result.",
  },
  id: {
    title: "Perlindungan Keluarga",
    desc: "Verifikasi identitas sebelum bertindak — kata sandi, trust circle, dan panduan balasan.",
    safeWord: "Kata Sandi",
    safeWordSet: "Atur kata sandi keluarga",
    safeWordSetDesc: "Jika ada yang menelepon mengaku darurat, tanya kata ini.",
    safeWordCheck: "Cek kata sandi",
    safeWordPassed: "Kata sandi benar",
    safeWordFailed: "Kata sandi salah",
    verifyBtn: "Verifikasi",
    trustCircle: "Trust Circle",
    trustCircleDesc: "Anggota keluarga yang bisa verifikasi silang klaim darurat.",
    addContact: "Tambah kontak",
    contactName: "Nama",
    contactUser: "Username Telegram",
    addBtn: "Tambah",
    pings: "Verifikasi Ping",
    pingDesc: "Verifikasi silang: kirim ping ke Trust Circle untuk konfirmasi identitas.",
    createPing: "Ping Keluarga",
    pingClaim: "Apa yang mereka klaim?",
    sendPing: "Kirim",
    pingDetails: "Detail (opsional)",
    pingScammerName: "Nama penipu / alias",
    pingScammerHandle: "No. HP / @username",
    pingChannel: "Kanal (WA, telepon, IG, SMS…)",
    pingThreat: "Jenis penipuan",
    pingAmount: "Nominal / rekening diminta",
    pingLocation: "Lokasi korban",
    pingNotes: "Catatan tambahan",
    pingRisk: "Tingkat risiko",
    pingEvidence: "URL bukti (rekaman/screenshot)",
    riskCritical: "Kritis",
    riskHigh: "Tinggi",
    riskMedium: "Sedang",
    riskLow: "Rendah",
    realIdentity: "Identitas asli",
    impostor: "Penipu",
    noContacts: "Belum ada kontak. Tambah anggota keluarga dulu.",
    noPings: "Tidak ada ping tertunda.",
    replyScripts: "Apa yang harus dikatakan",
    scriptsDesc: "Panduan balasan berdasarkan taktik yang terdeteksi di panggilan ini.",
    verifyActions: "Tindakan segera",
    configureFirst: "Atur kata sandi dan tambah anggota keluarga untuk mengaktifkan Family Protection.",
    noGuidance: "Tidak ada panduan spesifik untuk hasil ini.",
  },
};

// -------------------------------------------------------
// Component
// -------------------------------------------------------

interface FamilyGuardProps {
  guidance: FamilyGuardGuidance | null;
  language: "en" | "id";
}

export default function FamilyGuard({ guidance, language }: FamilyGuardProps) {
  const t = labels[language];

  // Safe word state
  const [safeWord, setSafeWord] = useState("");
  const [swCheckText, setSwCheckText] = useState("");
  const [swConfigured, setSwConfigured] = useState(false);
  const [swCheckResult, setSwCheckResult] = useState<boolean | null>(null);
  const [swLoading, setSwLoading] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactUser, setContactUser] = useState("");
  const [contactLoading, setContactLoading] = useState(false);

  // Pings state
  const [pings, setPings] = useState<Ping[]>([]);
  const [pingClaim, setPingClaim] = useState("");
  const [pingScammerName, setPingScammerName] = useState("");
  const [pingScammerHandle, setPingScammerHandle] = useState("");
  const [pingChannel, setPingChannel] = useState("");
  const [pingThreat, setPingThreat] = useState("");
  const [pingAmount, setPingAmount] = useState("");
  const [pingLocation, setPingLocation] = useState("");
  const [pingNotes, setPingNotes] = useState("");
  const [pingRisk, setPingRisk] = useState("");
  const [pingEvidence, setPingEvidence] = useState("");
  const [pingDetailsOpen, setPingDetailsOpen] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const OWNER_STORAGE_KEY = "scamguard_family_owner";

  // Owner ID for family data isolation (header-based, not body)
  const [ownerId, setOwnerId] = useState<string>("");
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Restore owner from localStorage on mount so data persists across reloads.
  // If empty, generate a short default so all features work immediately out of the box.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(OWNER_STORAGE_KEY);
    if (saved && saved.trim()) {
      setOwnerId(saved.trim());
      setOwnerTouched(true);
    } else {
      const generated = "fam-" + Math.random().toString(36).substring(2, 8);
      setOwnerId(generated);
      window.localStorage.setItem(OWNER_STORAGE_KEY, generated);
      setOwnerTouched(true);
    }
  }, []);

  // Persist whenever the user changes it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ownerTouched) {
      if (ownerId.trim()) {
        window.localStorage.setItem(OWNER_STORAGE_KEY, ownerId.trim());
      } else {
        window.localStorage.removeItem(OWNER_STORAGE_KEY);
      }
    }
  }, [ownerId, ownerTouched]);

  const familyHeaders = useCallback(
    (extra: Record<string, string> = {}) => ({
      "Content-Type": "application/json",
      "X-Family-Owner": ownerId.trim(),
      ...extra,
    }),
    [ownerId],
  );

  const fetchContacts = useCallback(async () => {
    if (!ownerId.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/api/family/contacts`, {
        headers: familyHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        setContacts(d.contacts || []);
      }
    } catch {}
  }, [API_BASE, ownerId, familyHeaders]);

  const fetchPings = useCallback(async () => {
    if (!ownerId.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/api/family/pings`, {
        headers: familyHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        setPings(d.pings || []);
      }
    } catch {}
  }, [API_BASE, ownerId, familyHeaders]);

  // Load config on mount (or when ownerId changes)
  useEffect(() => {
    if (!ownerId.trim()) return;
    apiFetch(`${API_BASE}/api/family/safe-word`, { headers: familyHeaders() })
      .then((r) => r.json())
      .then((d) => setSwConfigured(d.configured ?? false))
      .catch(() => {});
    fetchContacts();
    fetchPings();
  }, [API_BASE, ownerId, familyHeaders, fetchContacts, fetchPings]);

  // --- Safe word actions ---
  const handleSetSafeWord = async () => {
    const word = safeWord.trim();
    if (!word || !ownerId.trim()) return;
    setSwLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/api/family/safe-word`, {
        method: "POST",
        headers: familyHeaders(),
        body: JSON.stringify({ safe_word: word }),
      });
      if (r.ok) {
        setSwConfigured(true);
        setSafeWord("");
      }
    } catch {}
    setSwLoading(false);
  };

  const handleCheckSafeWord = async () => {
    const answer = swCheckText.trim();
    if (!answer || !ownerId.trim()) return;
    setSwLoading(true);
    setSwCheckResult(null);
    try {
      const r = await apiFetch(`${API_BASE}/api/family/safe-word/verify`, {
        method: "POST",
        headers: familyHeaders(),
        body: JSON.stringify({ answer }),
      });
      if (r.ok) {
        const d = await r.json();
        setSwCheckResult(d.passed ?? false);
      }
    } catch {}
    setSwLoading(false);
  };

  // --- Contact actions ---
  const addContact = async () => {
    const name = contactName.trim();
    if (!name || !ownerId.trim()) return;
    setContactLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/api/family/contacts`, {
        method: "POST",
        headers: familyHeaders(),
        body: JSON.stringify({ name, telegram_username: contactUser.trim() }),
      });
      if (r.ok) {
        setContactName("");
        setContactUser("");
        await fetchContacts();
      }
    } catch {}
    setContactLoading(false);
  };

  const removeContact = async (id: string) => {
    if (!ownerId.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/api/family/contacts/${id}`, {
        method: "DELETE",
        headers: familyHeaders(),
      });
      if (r.ok) await fetchContacts();
    } catch {}
  };

  // --- Ping actions ---
  const createPing = async () => {
    const claim = pingClaim.trim();
    if (!claim || !ownerId.trim()) return;
    setPingLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/api/family/pings`, {
        method: "POST",
        headers: familyHeaders(),
        body: JSON.stringify({
          claim,
          scammer_name: pingScammerName.trim(),
          scammer_handle: pingScammerHandle.trim(),
          scammer_channel: pingChannel.trim(),
          threat_type: pingThreat.trim(),
          amount_requested: pingAmount.trim(),
          location: pingLocation.trim(),
          notes: pingNotes.trim(),
          risk_level: pingRisk.trim(),
          evidence_url: pingEvidence.trim(),
        }),
      });
      if (r.ok) {
        setPingClaim("");
        setPingScammerName("");
        setPingScammerHandle("");
        setPingChannel("");
        setPingThreat("");
        setPingAmount("");
        setPingLocation("");
        setPingNotes("");
        setPingRisk("");
        setPingEvidence("");
        setPingDetailsOpen(false);
        await fetchPings();
      }
    } catch {}
    setPingLoading(false);
  };

  const respondPing = async (pingId: string, confirmed: boolean) => {
    if (!ownerId.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/api/family/pings/${pingId}/respond`, {
        method: "POST",
        headers: familyHeaders(),
        body: JSON.stringify({ confirmed }),
      });
      if (r.ok) await fetchPings();
    } catch {}
  };

  const hasGuidance = guidance && (guidance.reply_scripts.length > 0 || guidance.verify_actions.length > 0);

  return (
    <div className="space-y-5">
      {/* 0. Family owner identity (data isolation) */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-mono uppercase text-slate-400">
            {language === "id" ? "ID Keluarga" : "Family ID"}
          </label>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="text-[11px] px-2 py-1 rounded-md border border-cyan-500/40 text-cyan-300 bg-cyan-950/30 hover:bg-cyan-900/40 flex items-center gap-1.5 transition-colors"
          >
            <Sparkle size={12} weight="fill" />
            {language === "id" ? "Panduan Setup" : "Setup Wizard"}
          </button>
        </div>
        <input
          type="text"
          value={ownerId}
          onChange={(e) => {
            setOwnerId(e.target.value);
            setOwnerTouched(true);
          }}
          placeholder={language === "id" ? "mis. keluarga-budi" : "e.g. family-budi"}
          className="input-field h-9 text-sm"
        />
        <p className="text-[11px] text-slate-500">
          {language === "id"
            ? "Kosongkan untuk data demo. Isi agar data disimpan antar sesi."
            : "Leave empty for demo data. Fill this so your data persists across sessions."}
        </p>
        {!ownerId.trim() && (
          <p className="text-[11px] text-amber-400">
            {language === "id"
              ? "Masukkan Family ID dulu agar Safe Word, Trust Circle, dan Ping bisa disimpan."
              : "Enter a Family ID first so Safe Word, Trust Circle, and Pings can be saved."}
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          {language === "id"
            ? "Semua data keluarga (kata sandi, kontak, ping) terpisah berdasarkan ID ini. Wajib diisi sebelum menyimpan data."
            : "All family data (safe word, contacts, pings) is isolated by this ID. Required before saving anything."}
        </p>
      </div>

      {/* 1. Reply scripts & actions (from current analysis) */}
      {hasGuidance && (
        <>
          {guidance.reply_scripts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.1em] font-mono flex items-center gap-2">
                <BellRinging size={14} weight="fill" className="text-amber-400" />
                {t.replyScripts}
              </h3>
              <p className="text-xs text-slate-400">{t.scriptsDesc}</p>
              <div className="space-y-3">
                {guidance.reply_scripts.map((s, idx) => (
                  <div key={`${s.tactic}-${idx}`} className="card p-4 space-y-2 border-l-4 border-l-amber-500">
                    <p className="text-xs font-semibold text-slate-200">{s.title}</p>
                    <div className="glass p-3 rounded-lg border border-slate-800/60">
                      <p className="text-[11px] font-mono uppercase text-slate-400 mb-1">
                        {language === "id" ? "Katakan:" : "Say:"}
                      </p>
                      <p className="text-sm font-medium text-emerald-300">"{s.say}"</p>
                    </div>
                    <div className="glass p-3 rounded-lg border border-slate-800/60">
                      <p className="text-[11px] font-mono uppercase text-slate-400 mb-1">
                        {language === "id" ? "Jangan:" : "Avoid:"}
                      </p>
                      <p className="text-xs text-red-300">{s.avoid}</p>
                    </div>
                    <p className="text-[11px] text-slate-400 italic">{s.why}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {guidance.verify_actions.length > 0 && (
            <div className="card p-4 space-y-2 bg-blue-950/20 border-blue-800/40">
              <h4 className="text-xs font-semibold text-blue-300 uppercase tracking-[0.1em] font-mono">
                {t.verifyActions}
              </h4>
              <ul className="space-y-1.5">
                {guidance.verify_actions.map((act, i) => (
                  <li key={i} className="text-xs text-slate-200 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    {act}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* 2. Safe word section */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.1em] font-mono flex items-center gap-2">
          <LockKey size={14} weight="fill" className="text-blue-400" />
          {t.safeWord}
        </h3>

        {swConfigured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Check size={16} weight="bold" className="text-emerald-400" />
              <span className="text-xs text-emerald-400 font-semibold">
                {language === "id" ? "Kata sandi dikonfigurasi" : "Safe word configured"}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">{t.safeWordCheck}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={swCheckText}
                  onChange={(e) => setSwCheckText(e.target.value)}
                  placeholder={language === "id" ? "Ketik kata sandi..." : "Enter safe word..."}
                  className="input-field flex-1 h-9 text-sm"
                  disabled={swLoading}
                />
                <button
                  type="button"
                  onClick={handleCheckSafeWord}
                  disabled={swLoading || !swCheckText.trim()}
                  className="btn-primary h-9 px-3 text-xs"
                >
                  <Password size={14} weight="bold" />
                  {t.verifyBtn}
                </button>
              </div>
              {swCheckResult !== null && (
                <div
                  className={`flex items-center gap-2 text-xs font-semibold ${
                    swCheckResult ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {swCheckResult ? <Check size={14} weight="bold" /> : <X size={14} weight="bold" />}
                  {swCheckResult ? t.safeWordPassed : t.safeWordFailed}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{t.safeWordSetDesc}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={safeWord}
                onChange={(e) => setSafeWord(e.target.value)}
                placeholder={language === "id" ? "Kata sandi rahasia..." : "Secret safe word..."}
                className="input-field flex-1 h-9 text-sm"
                disabled={swLoading}
              />
              <button
                type="button"
                onClick={handleSetSafeWord}
                disabled={swLoading || !safeWord.trim()}
                className="btn-primary h-9 px-3 text-xs"
              >
                <LockKey size={14} weight="bold" />
                {t.addBtn}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Trust Circle */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.1em] font-mono flex items-center gap-2">
          <UsersThree size={14} weight="fill" className="text-violet-400" />
          {t.trustCircle}
        </h3>
        <p className="text-xs text-slate-500">{t.trustCircleDesc}</p>

        {contacts.length > 0 && (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between glass p-3 rounded-lg border border-slate-800/40">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{c.name}</p>
                  {c.telegram_username && (
                  <>
                    <p className="text-xs text-slate-500">{c.telegram_username}</p>
                    <p className={`text-[11px] ${c.ping_ready ? "text-emerald-400" : "text-amber-400"}`}>
                      {c.ping_ready
                        ? (language === "id" ? "· siap terima ping" : "· ready for pings")
                        : (language === "id" ? "· belum /start bot" : "· hasn't /start-ed bot")}
                    </p>
                  </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(c.id)}
                  className="p-1.5 rounded-lg hover:bg-red-950/50 text-slate-500 hover:text-red-400 transition-colors"
                  title={language === "id" ? "Hapus" : "Remove"}
                >
                  <UserMinus size={16} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {contacts.length === 0 && (
          <p className="text-xs text-slate-600 italic">{t.noContacts}</p>
        )}

        <p className="text-[11px] text-slate-500">
          {language === "id"
            ? "💡 Agar kontak bisa menerima notifikasi ping, pastikan mereka sudah buka dan ketik /start di bot @S_cam_Guard_AI_bot terlebih dahulu."
            : "💡 For contacts to receive telegram pings, ensure they have opened and sent /start to @S_cam_Guard_AI_bot first."}
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder={t.contactName}
            className="input-field flex-1 h-9 text-sm"
            disabled={contactLoading}
          />
          <input
            type="text"
            value={contactUser}
            onChange={(e) => setContactUser(e.target.value)}
            placeholder={t.contactUser}
            className="input-field sm:w-44 h-9 text-sm"
            disabled={contactLoading}
          />
          <button
            type="button"
            onClick={addContact}
            disabled={contactLoading || !contactName.trim()}
            className="btn-primary h-9 px-3 text-xs"
          >
            <UserPlus size={14} weight="bold" />
            {t.addBtn}
          </button>
        </div>
      </div>

      {/* 4. Cross-Verification Pings */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.1em] font-mono flex items-center gap-2">
          <Broadcast size={14} weight="fill" className="text-amber-400" />
          {t.pings}
        </h3>
        <p className="text-xs text-slate-500">{t.pingDesc}</p>

        {pings.length > 0 && (
          <ul className="space-y-2">
            {pings.map((p) => (
              <li key={p.id} className="glass p-3 rounded-lg border border-slate-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    {new Date(p.created_at * 1000).toLocaleTimeString()}
                  </span>
                  <span
                    className={`badge text-[10px] uppercase font-mono ${
                      p.status === "confirmed" || p.status === "verified_real"
                        ? "badge-low text-emerald-400"
                        : p.status === "impostor" || p.status === "impostor_alert"
                          ? "badge-critical text-red-400"
                          : "badge-medium text-yellow-400"
                    }`}
                  >
                    {p.status === "verified_real"
                      ? (language === "id" ? "Identitas Asli" : "Real Identity")
                      : p.status === "impostor_alert"
                        ? (language === "id" ? "Penipu Terdeteksi" : "Impostor Flagged")
                        : p.status}
                  </span>
                </div>
                <p className="text-xs text-slate-200">"{p.claim}"</p>
                {/* Rich context from the victim's report */}
                {(p.scammer_name || p.scammer_handle || p.threat_type || p.amount_requested || p.location || p.risk_level) && (
                  <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/50">
                    {p.risk_level && (
                      <p className={`font-mono uppercase font-bold ${
                        p.risk_level === "critical" ? "text-red-400"
                          : p.risk_level === "high" ? "text-orange-400"
                          : p.risk_level === "medium" ? "text-yellow-400"
                          : "text-emerald-400"
                      }`}>
                        {language === "id" ? "Risiko" : "Risk"}: {p.risk_level}
                      </p>
                    )}
                    {p.scammer_name && (
                      <p>{language === "id" ? "Penipu" : "Scammer"}: <span className="text-slate-200">{p.scammer_name}</span></p>
                    )}
                    {p.scammer_handle && (
                      <p>{language === "id" ? "Kontak" : "Handle"}: <span className="text-slate-200">{p.scammer_handle}</span></p>
                    )}
                    {p.scammer_channel && (
                      <p>{language === "id" ? "Kanal" : "Channel"}: <span className="text-slate-200">{p.scammer_channel}</span></p>
                    )}
                    {p.threat_type && (
                      <p>{language === "id" ? "Modus" : "Type"}: <span className="text-slate-200">{p.threat_type}</span></p>
                    )}
                    {p.amount_requested && (
                      <p>{language === "id" ? "Nominal" : "Amount"}: <span className="text-slate-200">{p.amount_requested}</span></p>
                    )}
                    {p.location && (
                      <p>{language === "id" ? "Lokasi" : "Location"}: <span className="text-slate-200">{p.location}</span></p>
                    )}
                    {p.notes && (
                      <p className="text-slate-500 italic">{p.notes}</p>
                    )}
                    {p.evidence_url && (
                      <a href={p.evidence_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                        {language === "id" ? "Lihat bukti" : "View evidence"} ↗
                      </a>
                    )}
                  </div>
                )}
                {p.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => respondPing(p.id, true)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
                    >
                      <Check size={12} weight="bold" />
                      {t.realIdentity}
                    </button>
                    <button
                      type="button"
                      onClick={() => respondPing(p.id, false)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-1"
                    >
                      <X size={12} weight="bold" />
                      {t.impostor}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {pings.length === 0 && (
          <p className="text-xs text-slate-600 italic">{t.noPings}</p>
        )}

        {/* Quick demo claims (one-click fill) */}
        <div className="flex flex-wrap gap-1.5">
          {(language === "id"
            ? ["Aku polisi, anakmu kecelakaan, transfer sekarang", "Ini bank, konfirmasi OTP-nya ya"]
            : ["Police here, your son had an accident, pay now", "This is your bank, confirm the OTP"]
          ).map((claim) => (
            <button
              key={claim}
              type="button"
              onClick={() => setPingClaim(claim)}
              className="text-[11px] px-2 py-1 rounded-full border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              {claim}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={pingClaim}
            onChange={(e) => setPingClaim(e.target.value)}
            placeholder={t.pingClaim}
            className="input-field flex-1 h-9 text-sm"
            disabled={pingLoading}
          />
          <button
            type="button"
            onClick={createPing}
            disabled={pingLoading || !pingClaim.trim()}
            className="btn-primary h-9 px-3 text-xs"
          >
            <Broadcast size={14} weight="bold" />
            {t.sendPing}
          </button>
        </div>

        {/* Collapsible detailed context (optional) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setPingDetailsOpen(!pingDetailsOpen)}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
          >
            {pingDetailsOpen ? "▼" : "▶"} {t.pingDetails}
          </button>
          {pingDetailsOpen && (
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" value={pingScammerName} onChange={(e) => setPingScammerName(e.target.value)} placeholder={t.pingScammerName} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingScammerHandle} onChange={(e) => setPingScammerHandle(e.target.value)} placeholder={t.pingScammerHandle} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingChannel} onChange={(e) => setPingChannel(e.target.value)} placeholder={t.pingChannel} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingThreat} onChange={(e) => setPingThreat(e.target.value)} placeholder={t.pingThreat} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingAmount} onChange={(e) => setPingAmount(e.target.value)} placeholder={t.pingAmount} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingLocation} onChange={(e) => setPingLocation(e.target.value)} placeholder={t.pingLocation} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingNotes} onChange={(e) => setPingNotes(e.target.value)} placeholder={t.pingNotes} className="input-field h-9 text-sm" disabled={pingLoading} />
                <input type="text" value={pingEvidence} onChange={(e) => setPingEvidence(e.target.value)} placeholder={t.pingEvidence} className="input-field h-9 text-sm" disabled={pingLoading} />
              </div>
              <div className="flex gap-1.5">
                {(["critical", "high", "medium", "low"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPingRisk(pingRisk === r ? "" : r)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono uppercase font-semibold transition-colors ${
                      pingRisk === r
                        ? r === "critical" ? "bg-red-500/30 text-red-300 border border-red-500"
                          : r === "high" ? "bg-orange-500/30 text-orange-300 border border-orange-500"
                          : r === "medium" ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500"
                          : "bg-emerald-500/30 text-emerald-300 border border-emerald-500"
                        : "border border-slate-700 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {language === "id"
                      ? (r === "critical" ? t.riskCritical : r === "high" ? t.riskHigh : r === "medium" ? t.riskMedium : t.riskLow)
                      : r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <FamilyOnboardingModal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        language={language}
        onComplete={(id) => {
          setOwnerId(id);
          setOwnerTouched(true);
          setSwConfigured(true);
          fetchContacts();
          fetchPings();
        }}
      />
    </div>
  );
}
