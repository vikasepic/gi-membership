"use client";

import { useEffect } from "react";

/**
 * Where on a sales page a visit stopped.
 *
 * Reads every <section> on the page in order, and keeps the deepest one whose
 * top has come into the viewport, plus the scroll depth as a percent. Sent
 * with sendBeacon when the tab is hidden or the page unloads, and every ten
 * seconds while it changes, so a phone that kills the tab still reports.
 *
 * Nothing here touches Meta, GA4 or the visitor row: it is a first-party
 * beacon to our own route, keyed on the visit the server already opened. A
 * preview is not a visit and the page does not mount this for one.
 */

/** ponytail: 60% of the viewport is "reached"; a band whose top is lower is only peeking. */
const REACH = 0.6;

export function sectionLabels(sections: Element[]): string[] {
  return sections.map((s, i) => {
    // A heading if there is one; otherwise the first words of the band, so a
    // video or image band still has a name in the report.
    const el = s.querySelector("h1, h2, h3, p, li, blockquote, figcaption, button, a");
    const text = el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return (text || `Section ${i + 1}`).slice(0, 60);
  });
}

export function ScrollTracker({ path }: { path: string }) {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll("section"));
    const labels = sectionLabels(sections);
    let furthest = -1;
    let depth = 0;
    let sent = { furthest: -1, depth: -1 };
    let ticking = false;

    const measure = () => {
      ticking = false;
      const vh = window.innerHeight;
      const doc = document.documentElement;
      const total = Math.max(doc.scrollHeight, 1);
      depth = Math.max(depth, Math.min(100, Math.round(((window.scrollY + vh) / total) * 100)));
      for (let i = sections.length - 1; i > furthest; i--) {
        if (sections[i].getBoundingClientRect().top < vh * REACH) {
          furthest = i;
          break;
        }
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    const send = () => {
      if (furthest === sent.furthest && depth === sent.depth) return;
      sent = { furthest, depth };
      const body = JSON.stringify({
        path,
        section: furthest,
        label: furthest >= 0 ? labels[furthest] : null,
        labels,
        sections: sections.length,
        depth,
      });
      try {
        if (!navigator.sendBeacon?.("/api/track/scroll", new Blob([body], { type: "application/json" }))) {
          void fetch("/api/track/scroll", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {
        // A lost beacon is a lost data point, never a broken page.
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    const tick = setInterval(send, 10_000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
      clearInterval(tick);
      send();
    };
  }, [path]);
  return null;
}
