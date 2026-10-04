"use client";

import { useEffect, useRef, useState } from "react";

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
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LiveCallMonitor() {
  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [risk, setRisk] = useState<StreamResponse["risk"] | null>(null);
  const [vision, setVision] = useState<StreamResponse["vision"] | null>(null);
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

  const start = async () => {
    setError(null);
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

      // WebSocket connection
      const wsUrl = API_BASE.replace(/^http/, "ws") + "/api/analyze/stream";
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsActive(true);
        setupAudioCapture(stream);
        setupVideoCapture();
      };

      ws.onmessage = (event) => {
        const data: StreamResponse = JSON.parse(event.data);
        setTranscript(data.transcript_window);
        setRisk(data.risk);
        setVision(data.vision);
        setElapsed(data.elapsed_seconds);
      };

      ws.onerror = () => setError("WebSocket connection failed");
      ws.onclose = () => {
        if (isActive) setError("Connection lost");
        stop();
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to access camera/mic";
      setError(msg);
    }
  };

  const stop = () => {
    setIsActive(false);

    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);

    wsRef.current?.close();
    wsRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
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

  const getRiskColor = (level: RiskLevel) => {
    switch (level) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      default:
        return "bg-emerald-500";
    }
  };

  const getRiskBorder = (level: RiskLevel) => {
    switch (level) {
      case "critical":
        return "border-red-500";
      case "high":
        return "border-orange-500";
      case "medium":
        return "border-yellow-500";
      default:
        return "border-emerald-500";
    }
  };

  return (
    <div className="space-y-6">
      {/* Video Preview with Overlay */}
      <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
        <video
          ref={videoRef}
          className="w-full aspect-video bg-black object-cover"
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Risk Overlay */}
        {isActive && risk && (
          <div className="absolute top-4 right-4 space-y-2">
            <div
              className={`px-4 py-2 rounded-xl border-2 ${getRiskBorder(
                risk.level
              )} bg-slate-950/90 backdrop-blur`}
            >
              <div className="text-xs uppercase tracking-wider font-mono text-slate-400">
                Risk Level
              </div>
              <div className="text-2xl font-black text-white capitalize">
                {risk.level}
              </div>
              <div className="text-sm font-mono text-slate-300">
                {(risk.score * 100).toFixed(1)}%
              </div>
            </div>

            {vision && vision.deepfake_score > 0.3 && (
              <div className="px-3 py-2 rounded-xl bg-red-950/90 border border-red-800 backdrop-blur">
                <div className="text-xs text-red-300 font-semibold">
                  ⚠️ Video Deepfake: {(vision.deepfake_score * 100).toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timer */}
        {isActive && (
          <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-slate-950/90 backdrop-blur border border-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-slate-300">
                {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {!isActive ? (
          <button
            onClick={start}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg transition active:scale-95"
          >
            <span>📹</span> Start Live Monitor
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold flex items-center gap-2 shadow-lg transition active:scale-95"
          >
            <span>⏹️</span> Stop
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Live Transcript */}
      {transcript && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <span>💬</span> Live Transcript
          </h3>
          <p className="text-slate-200 text-sm leading-relaxed italic font-serif">
            "{transcript}"
          </p>
        </div>
      )}

      {/* Recommendation */}
      {risk?.recommendation && (
        <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-2">
            <span>🛡️</span> Recommendation
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">{risk.recommendation}</p>
        </div>
      )}
    </div>
  );
}
