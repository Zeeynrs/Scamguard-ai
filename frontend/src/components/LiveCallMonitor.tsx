"use client";

import { useEffect, useRef, useState } from "react";
import {
  VideoCamera,
  Stop,
  Warning,
  ShieldCheck,
  ChatCircleDots,
  Eye,
  ChartLineUp,
  Clock,
} from "@/components/icons";

type RiskLevel = "low" | "medium" | "high" | "critical";

interface StreamResponse {
  seq: number;
  transcript_window: string;
  risk: {
    score: number;
    level: RiskLevel;
    recommendation: string;
  };
  elapsed_seconds: number;
  vision: {
    blink_rate: number;
    jitter_score: number;
    deepfake_score: number;
    indications: string[];
  };
  audio: {
    transcript: string;
    deepfake_score: number;
    deepfake_indications: string[];
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const riskTone: Record<
  RiskLevel,
  { border: string; text: string; bar: string; ring: string }
> = {
  critical: {
    border: "border-red-500",
    text: "text-red-400",
    bar: "bg-red-500",
    ring: "shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_8px_40px_-12px_rgba(239,68,68,0.5)]",
  },
  high: {
    border: "border-orange-500",
    text: "text-orange-400",
    bar: "bg-orange-500",
    ring: "shadow-[0_0_0_1px_rgba(249,115,22,0.35),0_8px_40px_-12px_rgba(249,115,22,0.5)]",
  },
  medium: {
    border: "border-yellow-500",
    text: "text-yellow-400",
    bar: "bg-yellow-500",
    ring: "shadow-[0_0_0_1px_rgba(234,179,8,0.35),0_8px_40px_-12px_rgba(234,179,8,0.45)]",
  },
  low: {
    border: "border-emerald-500",
    text: "text-emerald-400",
    bar: "bg-emerald-500",
    ring: "shadow-[0_0_0_1px_rgba(16,185,129,0.3),0_8px_40px_-12px_rgba(16,185,129,0.4)]",
  },
};

export default function LiveCallMonitor() {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [risk, setRisk] = useState<StreamResponse["risk"] | null>(null);
  const [vision, setVision] = useState<StreamResponse["vision"] | null>(null);
  const [audio, setAudio] = useState<StreamResponse["audio"] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seqRef = useRef(0);
  const frameIntervalRef = useRef<number | null>(null);
  const audioIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isActiveRef = useRef(false);
  const captureStartedRef = useRef(false);

  const start = async () => {
    setError(null);
    setConnecting(true);
    try {
      // Request camera + mic (16kHz mono ideal, browser will resample)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Connect WebSocket
      connectWebSocket(stream);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to access camera/mic";
      setError(msg);
      setConnecting(false);
    }
  };

  const connectWebSocket = (stream: MediaStream) => {
    const wsUrl = API_BASE.replace(/^http/, "ws") + "/api/analyze/stream";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsActive(true);
      setConnecting(false);
      isActiveRef.current = true;
      reconnectAttemptsRef.current = 0;
      // Only start capture once; on reconnect the processors are already running
      if (!captureStartedRef.current) {
        setupAudioCapture(stream);
        setupVideoCapture();
        captureStartedRef.current = true;
      }
    };

    ws.onmessage = (event) => {
      const data: StreamResponse = JSON.parse(event.data);

      // Handle server-sent errors (e.g., max duration)
      if ("error" in data) {
        setError((data as unknown as { error: string }).error);
        stop();
        return;
      }

      setTranscript(data.transcript_window);
      setRisk(data.risk);
      setVision(data.vision);
      setAudio(data.audio);
      setElapsed(data.elapsed_seconds);
    };

    ws.onerror = () => {
      if (reconnectAttemptsRef.current === 0) {
        setError("WebSocket connection failed");
        setConnecting(false);
      }
    };

    ws.onclose = () => {
      if (!isActiveRef.current) return; // user stopped manually

      // Auto-reconnect with exponential backoff (max 3 attempts)
      if (reconnectAttemptsRef.current < 3) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current - 1),
          8000
        );
        setError(
          `Connection lost. Reconnecting in ${delay / 1000}s... (${reconnectAttemptsRef.current}/3)`
        );

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (streamRef.current && isActiveRef.current) {
            connectWebSocket(streamRef.current);
          }
        }, delay);
      } else {
        setError("Connection lost. Max reconnect attempts reached. Click Stop and restart.");
        stop();
      }
    };
  };

  const stop = () => {
    setIsActive(false);
    setConnecting(false);
    isActiveRef.current = false;

    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

    wsRef.current?.close();
    wsRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;

    reconnectAttemptsRef.current = 0;
    captureStartedRef.current = false;
  };

  const setupAudioCapture = (stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const ctx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = ctx;

    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    let buffer: Int16Array[] = [];
    const CHUNK_SAMPLES = 16000 * 0.5; // 0.5s chunks

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      buffer.push(int16);

      const totalSamples = buffer.reduce((sum, b) => sum + b.length, 0);
      if (totalSamples >= CHUNK_SAMPLES) {
        const merged = new Int16Array(totalSamples);
        let offset = 0;
        for (const b of buffer) {
          merged.set(b, offset);
          offset += b.length;
        }
        buffer = [];

        // Convert Int16Array to bytes (little-endian) and base64
        const bytes = new Uint8Array(merged.buffer);
        const b64 = btoa(String.fromCharCode(...bytes));

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ seq: ++seqRef.current, audio_chunk: b64 }));
        }
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  };

  const setupVideoCapture = () => {
    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || !wsRef.current) return;
      if (wsRef.current.readyState !== WebSocket.OPEN) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = (reader.result as string).split(",")[1];
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ seq: ++seqRef.current, video_frame: b64 }));
            }
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.7
      );
    }, 1000); // 1 frame per second (hemat bandwidth)

    frameIntervalRef.current = interval as unknown as number;
  };

  useEffect(() => {
    return () => stop();
  }, []);

  const tone = riskTone[risk?.level ?? "low"];

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Video Preview with Overlay */}
      <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
        <video
          ref={videoRef}
          className="w-full aspect-video bg-black object-cover"
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Idle / empty state */}
        {!isActive && !connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 grid place-items-center">
              <VideoCamera size={26} weight="duotone" className="text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                Live Call Monitor
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Real-time scam detection on your camera and microphone. Nothing
                leaves this session without analysis.
              </p>
            </div>
          </div>
        )}

        {/* Connecting skeleton */}
        {connecting && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="w-8 h-8 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-400 tracking-wide">
                Establishing secure session…
              </p>
            </div>
          </div>
        )}

        {/* Risk Overlay */}
        {isActive && risk && (
          <div className="absolute top-3 right-3 md:top-4 md:right-4 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
            <div
              className={`px-3 py-2 md:px-4 md:py-2.5 rounded-xl border ${tone.border} bg-slate-950/90 backdrop-blur transition-colors duration-500 ${tone.ring}`}
            >
              <div className="text-[10px] md:text-xs uppercase tracking-[0.15em] font-mono text-slate-400">
                Risk Level
              </div>
              <div
                className={`text-xl md:text-2xl font-black capitalize leading-tight transition-colors duration-500 ${tone.text}`}
              >
                {risk.level}
              </div>
              <div className="text-xs md:text-sm font-mono text-slate-300 tabular-nums">
                {(risk.score * 100).toFixed(1)}%
              </div>
            </div>

            {vision && vision.deepfake_score > 0.3 && (
              <div className="px-3 py-2 rounded-xl bg-red-950/90 border border-red-800 backdrop-blur animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-[10px] md:text-xs text-red-300 font-semibold space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    Video Deepfake: {(vision.deepfake_score * 100).toFixed(0)}%
                  </div>
                  {vision.blink_rate !== undefined && vision.blink_rate < 10 && (
                    <div className="text-[9px] md:text-[10px] opacity-90 flex items-center gap-1 pl-3">
                      <Eye size={11} weight="bold" /> Blink:{" "}
                      {vision.blink_rate.toFixed(1)}/min (low)
                    </div>
                  )}
                  {vision.jitter_score > 15 && (
                    <div className="text-[9px] md:text-[10px] opacity-90 flex items-center gap-1 pl-3">
                      <ChartLineUp size={11} weight="bold" /> Jitter:{" "}
                      {vision.jitter_score.toFixed(1)}px
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timer */}
        {isActive && (
          <div className="absolute top-3 left-3 md:top-4 md:left-4 px-3 py-1.5 rounded-lg bg-slate-950/90 backdrop-blur border border-slate-700 animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-slate-300 tabular-nums flex items-center gap-1.5">
                <Clock size={13} weight="bold" className="text-slate-500" />
                {fmtTime(elapsed)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2 md:gap-3">
        {!isActive && !connecting ? (
          <button
            onClick={start}
            className="flex-1 md:flex-initial px-5 md:px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <VideoCamera size={18} weight="fill" /> Start Live Monitor
          </button>
        ) : connecting ? (
          <button
            disabled
            className="flex-1 md:flex-initial px-5 md:px-6 py-3 bg-slate-800 text-slate-300 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-wait"
          >
            <span className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
            Connecting…
          </button>
        ) : (
          <button
            onClick={stop}
            className="flex-1 md:flex-initial px-5 md:px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <Stop size={18} weight="fill" /> Stop
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3.5 md:p-4 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-xs md:text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-2.5">
            <Warning size={18} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Live Transcript */}
      {transcript && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-xs md:text-sm font-semibold text-slate-300 uppercase tracking-[0.12em] font-mono flex items-center gap-2">
            <ChatCircleDots size={16} weight="fill" className="text-blue-400" />{" "}
            Live Transcript
          </h3>
          <p className="text-slate-200 text-sm leading-relaxed border-l-2 border-slate-700 pl-3.5">
            {transcript}
          </p>

          {/* Audio deepfake warning */}
          {audio && audio.deepfake_score > 0.3 && (
            <div className="px-3 py-2 rounded-lg bg-orange-950/40 border border-orange-800/60 animate-in fade-in duration-300">
              <div className="text-[10px] md:text-xs text-orange-300 font-semibold space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Audio Deepfake: {(audio.deepfake_score * 100).toFixed(0)}%
                </div>
                {audio.deepfake_indications?.slice(0, 2).map((ind, i) => (
                  <div
                    key={i}
                    className="text-[9px] md:text-[10px] text-orange-400/80 pl-3.5"
                  >
                    • {ind}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendation */}
      {risk?.recommendation && (
        <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-2xl p-4 md:p-5 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-xs md:text-sm font-semibold text-emerald-400 uppercase tracking-[0.12em] font-mono flex items-center gap-2">
            <ShieldCheck size={16} weight="fill" /> Recommendation
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">
            {risk.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
