"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";
import { lessonVideo } from "@/lib/video-embed";
import { clampPosition, reachedCompletion, resumeOffer, type WatchRow } from "@/lib/watch";

/**
 * A lesson's video, and the two things a long one needs: somewhere to come
 * back to, and a bar that moves while you watch.
 *
 * The position is read over postMessage, which is the only channel either
 * provider offers a parent page, and the handshake is the same one the
 * completion signal has always used. Seeking is done through the URL instead:
 * "resume" and "start over" are two sources for the same player, applied
 * before the first frame, rather than a command racing a player that may not
 * be listening yet.
 */

/** How often the playhead is written. */
const SAVE_EVERY_MS = 20_000;

const ALLOWED_ORIGINS = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
];

type Props = {
  itemId: string;
  courseId: string;
  url: string;
  watch: WatchRow | null;
  /** False in a preview, where nothing may be recorded. */
  interactive: boolean;
  onCompleted?: () => void;
};

export function VideoPlayer({ itemId, courseId, url, watch, interactive, onCompleted }: Props) {
  const offer = resumeOffer(watch);
  // Null until the member has answered the resume prompt. A video that has
  // nothing to resume to starts at zero with no question asked.
  const [startAt, setStartAt] = useState<number | null>(offer.kind === "resume" ? null : 0);
  const completed = useRef(Boolean(watch?.completed));
  const lastSaved = useRef(0);
  const latest = useRef<{ position: number; duration: number | null }>({
    position: watch?.positionSeconds ?? 0,
    duration: watch?.durationSeconds ?? null,
  });

  const save = useCallback(
    (beacon: boolean) => {
      if (!interactive) return;
      const { position, duration } = latest.current;
      if (position <= 0) return;
      const body = JSON.stringify({ itemId, productId: courseId, positionSeconds: position, durationSeconds: duration });
      lastSaved.current = Date.now();
      // On the way out the page is already going; fetch would be cancelled,
      // so the last position of a session is the one most worth a beacon.
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/progress", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    },
    [interactive, itemId, courseId],
  );

  const complete = useCallback(() => {
    if (completed.current || !interactive) return;
    completed.current = true;
    void fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, productId: courseId, completed: true, source: "video" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.completed) return;
        track("LessonCompleted", { content_ids: [itemId], method: "video" }, eventIdFor("LessonCompleted", `${itemId}.${courseId}`));
        onCompleted?.();
      })
      .catch(() => {});
  }, [interactive, itemId, courseId, onCompleted]);

  // The player bridge. Both providers stay silent until the parent asks, and
  // the request is lost if it arrives before their script has loaded, so it
  // repeats until the first reply comes back.
  useEffect(() => {
    if (startAt === null) return;
    const embed = lessonVideo(url, { jsApi: true });
    if (!embed || embed.kind !== "iframe") return;
    const isYouTube = embed.provider === "YouTube";
    const targetOrigin = isYouTube ? "https://www.youtube.com" : "https://player.vimeo.com";
    const payload = isYouTube
      ? JSON.stringify({ event: "listening", id: 1, channel: "widget" })
      : JSON.stringify({ method: "addEventListener", value: "timeupdate" });

    let acked = false;
    const iframe = document.querySelector<HTMLIFrameElement>("[data-gi-video]");
    const ask = () => {
      if (acked) return;
      iframe?.contentWindow?.postMessage(payload, targetOrigin);
    };
    ask();
    const asking = setInterval(ask, 1000);

    const onMessage = (e: MessageEvent) => {
      // Any frame on the page could post a message. Only the players we
      // framed ourselves are allowed to move a playhead or finish a lesson.
      if (!ALLOWED_ORIGINS.includes(e.origin)) return;
      if (!acked) {
        acked = true;
        clearInterval(asking);
      }
      let seconds: number | null = null;
      let duration: number | null = null;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "timeupdate" && typeof d?.data?.seconds === "number") {
          seconds = d.data.seconds;
          duration = typeof d.data.duration === "number" ? d.data.duration : null;
        } else if (d?.event === "infoDelivery" && typeof d?.info?.currentTime === "number") {
          seconds = d.info.currentTime;
          duration = typeof d.info.duration === "number" && d.info.duration > 0 ? d.info.duration : null;
        }
      } catch {
        return; /* not a message of ours */
      }
      if (seconds === null) return;
      const position = clampPosition(seconds, duration);
      latest.current = { position, duration: duration ?? latest.current.duration };
      if (reachedCompletion(position, latest.current.duration)) complete();
      if (Date.now() - lastSaved.current >= SAVE_EVERY_MS) save(false);
    };
    window.addEventListener("message", onMessage);

    // Leaving the page, or hiding the tab, is the moment a position matters
    // most: it is the one the member will come back to.
    const onHide = () => {
      if (document.visibilityState === "hidden") save(true);
    };
    // Named, so the cleanup can actually take it off again. An inline arrow
    // here leaves one listener behind per mount, and this component remounts
    // every time someone answers the resume prompt.
    const onLeave = () => save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);

    return () => {
      clearInterval(asking);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      save(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, url, itemId]);

  if (startAt === null && offer.kind === "resume") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">You stopped at {offer.label}</p>
          <p className="text-sm text-muted">Pick up where you left off, or watch it again from the start.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setStartAt(offer.seconds)}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Continue from {offer.label}
          </button>
          <button
            type="button"
            onClick={() => setStartAt(0)}
            className="rounded-full border border-border px-5 py-2.5 text-sm hover:border-primary hover:text-primary"
          >
            Start from the beginning
          </button>
        </div>
      </div>
    );
  }

  const embed = lessonVideo(url, { startSeconds: startAt ?? 0, jsApi: true });
  if (!embed) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-sm text-muted">
        This video link is not one we can play. Paste a Vimeo or YouTube link, or a direct video file.
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
      {embed.kind === "iframe" ? (
        <iframe
          // Keyed on the start so choosing "start from the beginning" after a
          // resume remounts the player instead of leaving the old source.
          key={startAt ?? 0}
          data-gi-video
          src={embed.src}
          title="Lesson video"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
        />
      ) : (
        <video
          key={startAt ?? 0}
          className="h-full w-full"
          controls
          preload="metadata"
          src={startAt ? `${embed.src}#t=${startAt}` : embed.src}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
            latest.current = { position: clampPosition(el.currentTime, duration), duration };
            if (reachedCompletion(latest.current.position, duration)) complete();
            if (Date.now() - lastSaved.current >= SAVE_EVERY_MS) save(false);
          }}
          onPause={() => save(false)}
        />
      )}
    </div>
  );
}
