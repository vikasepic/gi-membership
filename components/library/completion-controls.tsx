"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual toggle only. Task 10 wires this to auto-completion signals
// (video watch %, download, dwell) via the same /api/progress endpoint.
export function CompletionControls({
  itemId,
  productId,
  completed,
  nextHref,
}: {
  itemId: string;
  productId: string;
  completed: boolean;
  videoUrl: string | null;
  nextHref: string;
}) {
  const router = useRouter();
  const [isDone, setIsDone] = useState(completed);

  async function toggle() {
    const next = !isDone;
    // /api/progress doesn't exist yet (Task 10) — fails silently, optimistic
    // UI still updates.
    await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, productId, completed: next, source: "manual" }),
    }).catch(() => {});
    setIsDone(next);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
      <button
        onClick={toggle}
        className={
          isDone
            ? "rounded-full border border-border px-5 py-2.5 text-sm text-muted hover:text-fg"
            : "rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        }
      >
        {isDone ? "Mark as not complete" : "Mark complete"}
      </button>
      {isDone && (
        <a href={nextHref} className="text-sm text-muted hover:text-fg">
          Next &rarr;
        </a>
      )}
    </div>
  );
}
