"use client";

import { useEffect, useRef, useState } from "react";

// Waveform audio player. Decodes the file once to draw a real amplitude
// waveform, then renders played/remaining as two colours over a canvas. Built
// on a plain <audio> element so seeking, keyboard and screen readers still work.
const BARS = 96;

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export function AudioPlayer({ src, title }: { src: string; title?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  // Decode once for the waveform. If it fails (CORS, unsupported codec) we fall
  // back to a flat bar — the player still works, it just isn't decorated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buf);
        const raw = decoded.getChannelData(0);
        const block = Math.floor(raw.length / BARS);
        const out: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          for (let j = 0; j < block; j++) sum += Math.abs(raw[i * block + j]);
          out.push(sum / block);
        }
        const max = Math.max(...out, 0.0001);
        if (!cancelled) setPeaks(out.map((v) => v / max));
        void ctx.close();
      } catch {
        if (!cancelled) setPeaks(new Array(BARS).fill(0.35));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Paint the waveform, split at the playhead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(document.documentElement);
    const played = styles.getPropertyValue("--primary").trim() || "#c8653d";
    const rest = styles.getPropertyValue("--border").trim() || "#d8d5cd";
    const gap = 2;
    const barW = Math.max(1, w / peaks.length - gap);
    const progress = duration ? current / duration : 0;

    peaks.forEach((p, i) => {
      const x = i * (barW + gap);
      const barH = Math.max(2, p * (h - 4));
      ctx.fillStyle = i / peaks.length <= progress ? played : rest;
      const y = (h - barH) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, barW / 2);
      ctx.fill();
    });
  }, [peaks, current, duration]);

  function seekFromEvent(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function cycleRate() {
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      {title && <span className="kicker text-muted">{title}</span>}

      <canvas
        ref={canvasRef}
        onClick={seekFromEvent}
        className="h-20 w-full cursor-pointer"
        aria-hidden
      />

      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-colors hover:bg-primary-hover"
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <span className="font-display text-sm tabular-nums text-muted">
          {fmt(current)} / {fmt(duration)}
        </span>

        <button
          onClick={cycleRate}
          className="ml-auto rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-fg"
          aria-label="Playback speed"
        >
          {rate}×
        </button>
      </div>

      {/* The real element: keeps native seeking, media keys and a11y intact. */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        className="sr-only"
      />
    </div>
  );
}
