"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckCircle, XCircle, WarningCircle, Cpu, Waveform, Terminal, Sparkle } from "@/components/icons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Health = {
  status: string;
  llm_provider: string;
  stt_model: string;
  uptime_seconds?: number;
  version?: string;
};

type BadgeProps = {
  language: "en" | "id";
};

export default function ModelHealthBadge({ language }: BadgeProps) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch(`${API_BASE}/api/health`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (mounted) setHealth(d);
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error || !health) {
    return (
      <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-900/60 text-slate-500 text-[10px] font-mono">
        <Terminal size={12} weight="fill" />
        {language === "id" ? "Model: mengecek…" : "Model: checking…"}
      </div>
    );
  }

  const isHealthy = health.status === "healthy";
  const llm = health.llm_provider ?? "?";
  const stt = health.stt_model ?? "?";

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-900/60 backdrop-blur-sm"
         style={{ borderColor: isHealthy ? "rgba(16,185,129,0.4)" : "rgba(234,88,12,0.4)" }}>
      <div className={`w-2 h-2 rounded-full ${isHealthy ? "bg-emerald-500" : "bg-orange-500"}`} />
      <Cpu size={12} weight="fill" className={isHealthy ? "text-emerald-400" : "text-orange-400"} />
      <span className="text-[10px] font-mono text-slate-200">
        {language === "id" ? "Model siap" : "Models ready"}
      </span>
      <span className="text-[9px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-slate-800">
        {llm}
      </span>
      <Waveform size={10} weight="fill" className="text-slate-500" />
      <span className="text-[9px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-slate-800">
        {stt}
      </span>
    </div>
  );
}