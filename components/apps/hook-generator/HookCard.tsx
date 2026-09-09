"use client";

import { useState } from "react";
import type { Hook } from "@/lib/builtin-apps/hook-generator/types";

export function HookCard({ hook }: { hook: Hook }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hook.hook);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable, nothing to do */
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-transform hover:-translate-y-0.5">
      {/* The slide itself: 4:5, like it will look in the feed */}
      <div className="flex aspect-[4/5] flex-col bg-navy p-5 text-white">
        <span className="self-start rounded-full border border-white/25 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/70">
          {hook.style}
        </span>
        <p className="my-auto font-display text-xl font-medium leading-[1.3] sm:text-[1.35rem]">
          {hook.hook}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {hook.on_screen && (
          <p className="font-mono text-xs text-muted">on-screen: &ldquo;{hook.on_screen}&rdquo;</p>
        )}
        <p className="text-sm leading-relaxed text-muted">{hook.why_it_stops_the_scroll}</p>
        <button
          onClick={copy}
          className="mt-auto self-start rounded-full border border-border px-4 py-1.5 text-xs font-semibold transition-colors hover:bg-navy hover:text-white"
        >
          {copied ? "Copied" : "Copy hook"}
        </button>
      </div>
    </div>
  );
}
