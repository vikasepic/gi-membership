"use client";

import { useEffect, useState } from "react";

/**
 * "Keya has this open."
 *
 * Polled rather than pushed: this stack has no realtime channel, and a 20s
 * poll of one indexed row is cheaper than adding one. The interval matters
 * less than the window — a heartbeat counts for 50s, so a tab that misses one
 * beat does not flicker out of the list and back in.
 *
 * The poll deliberately keeps running while the tab is hidden. Someone who has
 * switched to another window still has the section open, and the person about
 * to edit it needs to know that.
 */
export type Editor = { userId: string; name: string; seenAt: string };

const BEAT_MS = 20_000;

export function usePresence(resource: string, resourceId: string | null): Editor[] {
  const [editors, setEditors] = useState<Editor[]>([]);

  useEffect(() => {
    if (!resourceId) {
      setEditors([]);
      return;
    }
    let alive = true;
    const body = JSON.stringify({ resource, resourceId });

    const beat = async () => {
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { editors?: Editor[] };
        if (alive) setEditors(json.editors ?? []);
      } catch {
        // A failed heartbeat is not worth a message. The save is guarded
        // separately, so the worst case is the warning nobody got before.
      }
    };

    void beat();
    const timer = setInterval(beat, BEAT_MS);

    return () => {
      alive = false;
      clearInterval(timer);
      // Best effort, and keepalive so it still goes out if the tab is closing.
      // Missing it only means the name lingers for the rest of the window.
      void fetch("/api/presence", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };
  }, [resource, resourceId]);

  return editors;
}

/** The line that says who else is in here. Renders nothing when nobody is. */
export function PresenceNote({
  editors,
  what = "this",
  className = "",
}: {
  editors: Editor[];
  /** What they have open, for the sentence. */
  what?: string;
  className?: string;
}) {
  if (editors.length === 0) return null;
  const names =
    editors.length === 1
      ? editors[0].name
      : `${editors.slice(0, -1).map((e) => e.name).join(", ")} and ${editors[editors.length - 1].name}`;

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[0.68rem] text-primary ${className}`}
    >
      <span aria-hidden className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
      {names} {editors.length === 1 ? "has" : "have"} {what} open
    </span>
  );
}
