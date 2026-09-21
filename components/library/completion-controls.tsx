"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";

const DWELL_MS = 5 * 60 * 1000; // 5 minutes of VISIBLE time

export function CompletionControls({
  itemId,
  productId,
  completed,
  nextHref,
}: {
  itemId: string;
  productId: string;
  completed: boolean;
  nextHref: string;
}) {
  const router = useRouter();
  const [isDone, setIsDone] = useState(completed);
  const sent = useRef(false);

  async function send(next: boolean, source: "manual" | "video" | "download" | "dwell") {
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, productId, completed: next, source }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // Trust the server's answer, not our optimistic guess: manual_override
      // may have silently refused this write, and the DB is the source of truth.
      const nowDone = Boolean(data.completed);
      // Reported from here rather than from the button, because a lesson can
      // be finished three ways on this page: the button, opening a download,
      // or five minutes of visible dwell. All three arrive here.
      // Only on the transition INTO complete, and only if the server agreed:
      // un-marking is not a completion, and neither is a write it refused.
      if (nowDone && !isDone) {
        track(
          "LessonCompleted",
          { content_ids: [itemId], method: source },
          eventIdFor("LessonCompleted", `${itemId}.${productId}`),
        );
      }
      setIsDone(nowDone);
    } catch {
      return;
    }
    router.refresh();
  }

  // Dwell: 5 minutes of visible time. The timer pauses when the tab is hidden,
  // so an abandoned open tab can never complete a course.
  useEffect(() => {
    if (isDone) return;
    let elapsed = 0;
    let last = Date.now();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") elapsed += Date.now() - last;
      last = Date.now();
      if (elapsed >= DWELL_MS && !sent.current) {
        sent.current = true;
        void send(true, "dwell");
      }
    }, 5000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, itemId]);

  // Download: any attachment click on this page completes the item.
  useEffect(() => {
    if (isDone) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-gi-download]");
      if (el && !sent.current) {
        sent.current = true;
        void send(true, "download");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, itemId]);

  // Video completion is not here: it belongs with the playhead, which only
  // the player knows, and lives in components/library/video-player.tsx. This
  // component owns the three signals that have nothing to do with a video —
  // the button, an attachment click, and dwell time.

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border pt-6">
      <button
        onClick={() => {
          // Manual intent wins permanently (server enforces via manual_override).
          // Stop the automatic effects from competing once the student has
          // taken manual control in this session.
          sent.current = true;
          send(!isDone, "manual");
        }}
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
