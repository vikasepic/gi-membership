"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DWELL_MS = 5 * 60 * 1000; // 5 minutes of VISIBLE time

export function CompletionControls({
  itemId,
  productId,
  completed,
  videoUrl,
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
      setIsDone(Boolean(data.completed));
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

  // Video: YouTube and Vimeo expose progress cross-origin; other providers do
  // not, and simply fall through to the dwell timer.
  useEffect(() => {
    if (isDone || !videoUrl) return;
    const isVimeo = /vimeo\.com/i.test(videoUrl);
    const isYouTube = /youtube\.com|youtu\.be/i.test(videoUrl);
    if (!isVimeo && !isYouTube) return;

    const onMessage = (e: MessageEvent) => {
      if (sent.current) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // Vimeo player.js timeupdate payload
        if (d?.event === "timeupdate" && typeof d?.data?.percent === "number" && d.data.percent >= 0.5) {
          sent.current = true;
          void send(true, "video");
        }
        // YouTube iframe API state payload
        if (d?.event === "infoDelivery" && d?.info?.currentTime && d?.info?.duration) {
          if (d.info.currentTime / d.info.duration >= 0.5) {
            sent.current = true;
            void send(true, "video");
          }
        }
      } catch {
        /* not our message */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, videoUrl, itemId]);

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
