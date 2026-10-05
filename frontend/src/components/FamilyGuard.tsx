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
} from "@/components/icons";
import { apiFetch } from "@/lib/api";

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
}

interface Ping {
  id: string;
  owner: string;
  claim: string;
  status: string;
  created_at: number;
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
  const [pingLoading, setPingLoading] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Owner ID for family data isolation (header-based, not body)
  const [ownerId, setOwnerId] = useState<string>("");

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
        body: JSON.stringify({ claim }),
      });
      if (r.ok) {
        setPingClaim("");
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
        <label className="text-[11px] font-mono uppercase text-slate-400">
          {language === "id" ? "ID Keluarga" : "Family ID"}
        </label>
        <input
          type="text"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder={language === "id" ? "mis. keluarga-budi" : "e.g. family-budi"}
          className="input-field h-9 text-sm"
        />
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
                    <p className="text-xs text-slate-500">{c.telegram_username}</p>
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
                      p.status === "confirmed"
                        ? "badge-low text-emerald-400"
                        : p.status === "impostor"
                          ? "badge-critical text-red-400"
                          : "badge-medium text-yellow-400"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-slate-200">"{p.claim}"</p>
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
      </div>
    </div>
  );
}
