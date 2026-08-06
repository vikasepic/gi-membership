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
      const nowDone = Boolean(data.completed);
      // Reported from here rather than from the button, because a lesson can be
      // finished four ways — the button, watching half the video, opening the
      // download, or five minutes of visible dwell — and all four arrive here.
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

  // Video: YouTube and Vimeo expose progress cross-origin, but only after the
  // parent sends a handshake ("listening" / addEventListener) to the iframe —
  // neither player emits anything unprompted. Other providers are not
  // supported here and simply fall through to the dwell timer.
  useEffect(() => {
    if (isDone || !videoUrl) return;
    const isVimeo = /vimeo\.com/i.test(videoUrl);
    const isYouTube = /youtube\.com|youtu\.be/i.test(videoUrl);
    if (!isVimeo && !isYouTube) return;

    const ALLOWED_ORIGINS = [
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
    ];

    // The handshake is lost if sent before the player's script has finished
    // loading inside the iframe, so it's retried on an interval until the
    // first reply from that provider arrives.
    let handshakeAcked = false;
    let handshakeTimer: ReturnType<typeof setInterval> | undefined;
    const iframe = document.querySelector<HTMLIFrameElement>("[data-gi-video]");
    if (iframe) {
      const targetOrigin = isYouTube ? "https://www.youtube.com" : "https://player.vimeo.com";
      const payload = isYouTube
        ? JSON.stringify({ event: "listening", id: 1, channel: "widget" })
        : JSON.stringify({ method: "addEventListener", value: "timeupdate" });
      const sendHandshake = () => {
        if (handshakeAcked) return;
        iframe.contentWindow?.postMessage(payload, targetOrigin);
      };
      sendHandshake();
      handshakeTimer = setInterval(sendHandshake, 1000);
    }

    const onMessage = (e: MessageEvent) => {
      // Any frame could otherwise forge a completion by posting a message —
      // only trust the known player origins.
      if (!ALLOWED_ORIGINS.includes(e.origin)) return;
      if (!handshakeAcked) {
        handshakeAcked = true;
        if (handshakeTimer) clearInterval(handshakeTimer);
      }
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
    return () => {
      window.removeEventListener("message", onMessage);
      if (handshakeTimer) clearInterval(handshakeTimer);
    };
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
