"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Flag,
  Check,
  X,
  Warning,
  Clock,
  CheckCircle,
  XCircle,
} from "@/components/icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const labels = {
  en: {
    title: "Feedback & Corrections",
    desc: "Review user-reported false positives / false negatives to improve detection.",
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    excerpt: "Reported text",
    label: "Label",
    comment: "Comment",
    accept: "Accept",
    reject: "Reject",
    noReports: "No reports in this category.",
    counts: "Summary",
    scam: "Scam",
    benign: "Benign",
    moderatedBy: "This panel lets you accept or reject user corrections. Accepted reports can feed future model calibration.",
    time: "Reported",
  },
  id: {
    title: "Umpan Balik & Koreksi",
    desc: "Tinjau laporan false positive / false negative dari pengguna untuk tingkatkan deteksi.",
    pending: "Menunggu",
    accepted: "Diterima",
    rejected: "Ditolak",
    excerpt: "Teks yang dilaporkan",
    label: "Label",
    comment: "Komentar",
    accept: "Terima",
    reject: "Tolak",
    noReports: "Belum ada laporan di kategori ini.",
    counts: "Ringkasan",
    scam: "Scam",
    benign: "Aman",
    moderatedBy: "Panel ini memungkinkan menerima atau menolak koreksi pengguna. Laporan diterima bisa masuk kalibrasi model.",
    time: "Dilaporkan",
  },
};

interface FeedbackRow {
  id: string;
  excerpt: string;
  is_scam: boolean;
  comment: string;
  status: string;
  created_at: number;
}

type TabKey = "pending" | "accepted" | "rejected";

const TABS: TabKey[] = ["pending", "accepted", "rejected"];

export default function FeedbackPanel({ language }: { language: "en" | "id" }) {
  const t = labels[language];
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [reports, setReports] = useState<FeedbackRow[]>([]);
  const [counts, setCounts] = useState<{ pending: number; accepted: number; rejected: number }>({
    pending: 0,
    accepted: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(false);
  const [moderating, setModerating] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/feedback/counts`);
      if (r.ok) setCounts(await r.json());
    } catch {}
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/feedback?status=${activeTab}&limit=50`);
      if (r.ok) {
        const d = await r.json();
        setReports(d.reports || []);
      }
    } catch {}
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const moderate = async (id: string, status: "accepted" | "rejected") => {
    setModerating(id);
    try {
      const r = await fetch(`${API_BASE}/api/feedback/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (r.ok) {
        await fetchReports();
        await fetchCounts();
      }
    } catch {}
    setModerating(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Flag size={16} weight="fill" className="text-amber-400" />
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.1em] font-mono">
          {t.title}
        </h3>
      </div>
      <p className="text-xs text-slate-500">{t.desc}</p>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2">
        {([
          ["pending", t.pending, Clock, "text-yellow-400"],
          ["accepted", t.accepted, CheckCircle, "text-emerald-400"],
          ["rejected", t.rejected, XCircle, "text-red-400"],
        ] as const).map(([key, label, Icon, color]) => (
          <div key={key} className="glass p-3 rounded-xl text-center">
            <Icon size={14} weight="fill" className={`mx-auto mb-1 ${color}`} />
            <div className="text-lg font-mono font-bold tabular-nums text-slate-200">
              {counts[key as keyof typeof counts]}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass px-1 py-1 rounded-xl" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            {t[tab]}
          </button>
        ))}
      </div>

      {/* Report list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length > 0 ? (
        <ul className="space-y-2">
          {reports.map((row) => (
            <li
              key={row.id}
              className="glass p-4 rounded-xl border border-slate-800/40 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200 truncate">"{row.excerpt}"</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className={`badge text-[10px] ${
                        row.is_scam ? "badge-critical" : "badge-low"
                      }`}
                    >
                      {row.is_scam ? t.scam : t.benign}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {new Date(row.created_at * 1000).toLocaleString()}
                    </span>
                  </div>
                  {row.comment && (
                    <p className="text-xs text-slate-400 mt-1 italic">{row.comment}</p>
                  )}
                </div>
              </div>

              {activeTab === "pending" && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => moderate(row.id, "accepted")}
                    disabled={moderating === row.id}
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check size={12} weight="bold" />
                    {t.accept}
                  </button>
                  <button
                    type="button"
                    onClick={() => moderate(row.id, "rejected")}
                    disabled={moderating === row.id}
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <X size={12} weight="bold" />
                    {t.reject}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-8 glass rounded-xl border border-dashed border-slate-800">
          <Warning size={20} weight="duotone" className="text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-600">{t.noReports}</p>
        </div>
      )}

      <p className="text-[11px] text-slate-600 italic">{t.moderatedBy}</p>
    </div>
  );
}
