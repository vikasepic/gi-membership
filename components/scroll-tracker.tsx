"use client";

import { useEffect } from "react";
import { track } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";

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

/**
 * The buy button a click landed on, if it was one: any link to a checkout,
 * whichever block drew it. Null for every other click.
 */
export function buyClickOf(target: EventTarget | null, sections: Element[], labels: string[]) {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  if (!link || !/\/checkout(\/|\?|$)/.test(link.getAttribute("href") ?? "")) return null;
  const button = link.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
  if (!button) return null;
  const holder = link.closest("section");
  const section = holder ? sections.indexOf(holder) : -1;
  return { section, sectionLabel: section >= 0 ? labels[section] : "Outside the sections", button };
}

/**
 * Where a buy button sits, as event params: the words on it and the section
 * holding it. Rides on AddToCart to Meta and GA4. Empty off a sales page or
 * outside a checkout link, so a caller can always spread it.
 */
export function buyContext(el: Element | null): Record<string, string | number> {
  if (typeof document === "undefined" || !el) return {};
  const sections = Array.from(document.querySelectorAll("section"));
  const hit = buyClickOf(el, sections, sectionLabels(sections));
  if (!hit) return {};
  return {
    button_text: hit.button,
    page_section: hit.section + 1,
    section_name: hit.sectionLabel,
  };
}

/** Scroll depths reported to Meta and GA4, once each per page view. */
export const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

export function ScrollTracker({ path }: { path: string }) {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll("section"));
    const labels = sectionLabels(sections);
    let furthest = -1;
    let depth = 0;
    let sent = { furthest: -1, depth: -1 };
    let ticking = false;
    const reported = new Set<number>();

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
      // Meta and GA4 get the milestones; our own table keeps every section.
      for (const m of SCROLL_MILESTONES) {
        if (depth >= m && !reported.has(m)) {
          reported.add(m);
          track(
            "ScrollDepth",
            {
              percent_scrolled: m,
              page_path: path,
              ...(furthest >= 0 ? { page_section: furthest + 1, section_name: labels[furthest] } : {}),
            },
            eventIdFor("ScrollDepth"),
          );
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

    // Capture phase, so it runs before the link navigates away. Sent on its
    // own beacon; the Meta/GA4 AddToCart on the same click is untouched.
    const onClick = (e: MouseEvent) => {
      const hit = buyClickOf(e.target, sections, labels);
      if (!hit) return;
      const body = JSON.stringify({ path, ...hit });
      try {
        if (!navigator.sendBeacon?.("/api/track/click", new Blob([body], { type: "application/json" }))) {
          void fetch("/api/track/click", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {
        // A lost click is a lost data point, never a broken button.
      }
    };

    measure();
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    const tick = setInterval(send, 10_000);
    return () => {
      document.removeEventListener("click", onClick, true);
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
