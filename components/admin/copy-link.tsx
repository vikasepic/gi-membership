"use client";

import { useState } from "react";

/**
 * The page's public address, ready to paste into an ad, an email or a DM.
 *
 * Shown in full rather than behind a "copy" button alone: the point of a
 * shareable link is often to check it reads well, and a hidden URL cannot be
 * checked. Selecting the text still works if the clipboard is blocked.
 */
export function CopyLink({
  url,
  label,
  note,
}: {
  url: string;
  label: string;
  note?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      // Clipboard access can be refused — over plain http, or by permission.
      // Saying so beats a button that silently does nothing.
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
        >
          {state === "copied" ? "Copied" : state === "failed" ? "Press ⌘C" : "Copy"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
        >
          Open ↗
        </a>
      </div>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
