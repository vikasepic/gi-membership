"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/recent-buyers-time";

// The recent buyers popup (spec 2026-10-26-recent-buyers-popup-design.md):
// one real buyer at a time in the bottom corner. It runs on pages that take
// money, so it waits for the page to finish loading before asking for anything,
// and every failure is silence.

type Card = {
  firstName: string;
  initial: string;
  flagSvg: string | null;
  verb: string;
  itemName: string;
  imageUrl: string | null;
  at: string;
};
type Shown = Card & { age: string };

export type RecentBuyersScope = { offer: string } | { product: string } | { home: true };

const FIRST_DELAY_MS = 4000;
const CLOSED_KEY = "rb-closed";

/** Closed earlier in this visit. A storage that throws (a private window) only loses the memory. */
function closedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Height of the tallest bar fixed to the bottom of the screen, so the card can
 * sit above it. Measured while a card shows: a page's own bar (the Foundations
 * Weekend seat bar is the builder's sticky bar) slides in on scroll, and the
 * code knows nothing about it.
 *
 * A grid of hit tests up from the bottom edge, not one row along it. That
 * seat bar's fixed wrapper is pointer-events none, which hit testing skips,
 * and its pill floats clear of the edge; what gets hit is the pill, and the
 * fixed wrapper is found by walking up from it.
 */
export function bottomClearance(win: Window): number {
  const doc = win.document;
  if (typeof doc.elementsFromPoint !== "function") return 0;
  const h = win.innerHeight;
  const w = win.innerWidth;
  let clear = 0;
  for (const y of [1, 20, 40, 60, 90, 120]) {
    for (const x of [8, w / 2, w - 8]) {
      // The topmost thing under the point that is not the card: a bar you can
      // see is on top of the page there, so nothing beneath it needs checking.
      const hit = doc.elementsFromPoint(x, h - y).find((e) => !e.closest(".rb-card"));
      for (let n: Element | null = hit ?? null; n && n !== doc.body; n = n.parentElement) {
        const pos = win.getComputedStyle(n).position;
        if (pos !== "fixed" && pos !== "sticky") continue;
        const r = n.getBoundingClientRect();
        if (r.bottom >= h - 2) clear = Math.max(clear, h - r.top);
        break;
      }
    }
  }
  // ponytail: a full-screen overlay is not a bar; half the screen is the ceiling.
  return Math.min(clear, h / 2);
}

const gutter = (win: Window) => (win.innerWidth >= 768 ? 24 : 12);

function queryOf(scope: RecentBuyersScope): string {
  if ("offer" in scope) return `offer=${encodeURIComponent(scope.offer)}`;
  if ("product" in scope) return `product=${encodeURIComponent(scope.product)}`;
  return "home=1";
}

export function RecentBuyers({ scope }: { scope: RecentBuyersScope }) {
  const [card, setCard] = useState<Shown | null>(null);
  const [bottom, setBottom] = useState(12);
  const closed = useRef(false);
  const query = queryOf(scope);

  useEffect(() => {
    if (closedThisVisit()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watch: ReturnType<typeof setInterval> | undefined;
    const place = () => setBottom(bottomClearance(window) + gutter(window));

    const run = async () => {
      let data: { gapMs?: number; showMs?: number; cards?: Card[] };
      try {
        data = await (await fetch(`/api/recent-buyers?${query}`)).json();
      } catch {
        return;
      }
      const cards = Array.isArray(data.cards) ? data.cards : [];
      const showMs = Number(data.showMs) || 6000;
      const gapMs = Number(data.gapMs) || 12000;
      if (cancelled || cards.length === 0) return;
      // Twice through, then quiet: two names cycling for ten minutes look made up.
      const total = cards.length * 2;
      const show = (i: number, delay: number) => {
        timer = setTimeout(() => {
          if (cancelled || closed.current || closedThisVisit()) return;
          place();
          const c = cards[i % cards.length];
          setCard({ ...c, age: timeAgo(c.at, new Date()) });
          // A page's bar can slide in on scroll while the card is up; keep
          // clear of it rather than cover its button. Three hit tests a beat.
          watch = setInterval(place, 400);
          timer = setTimeout(() => {
            clearInterval(watch);
            setCard(null);
            if (i + 1 < total) show(i + 1, gapMs);
          }, showMs);
        }, delay);
      };
      show(0, FIRST_DELAY_MS);
    };

    const start = () => void run();
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(watch);
      window.removeEventListener("load", start);
    };
  }, [query]);

  if (!card) return null;

  const close = () => {
    closed.current = true;
    try {
      sessionStorage.setItem(CLOSED_KEY, "1");
    } catch {
      // Remembered for this page only.
    }
    setCard(null);
  };

  return (
    <div className="rb-card" style={{ bottom }}>
      <style>{CSS}</style>
      {/* Decorative to a screen reader: a card every few seconds would talk over the page. */}
      <div className="rb-body" aria-hidden="true">
        <div className="rb-pic">
          {card.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" />
          ) : (
            <span className="rb-initial">{card.initial}</span>
          )}
          <span className="rb-check">✓</span>
        </div>
        <div className="rb-text">
          <div className="rb-who">
            <span className="rb-name">{card.firstName}</span>
            {card.flagSvg && (
              // From country-flag-icons on the server, never from a visitor.
              <span className="rb-flag" dangerouslySetInnerHTML={{ __html: card.flagSvg }} />
            )}
          </div>
          <div className="rb-what">
            {card.verb} <b>{card.itemName}</b>
          </div>
          <div className="rb-meta">
            <span className="rb-age">{card.age}</span>
            <span className="rb-dot" />
            <span className="rb-ok">✓ Verified</span>
          </div>
        </div>
      </div>
      <button type="button" className="rb-close" aria-label="Close" onClick={close}>
        ×
      </button>
    </div>
  );
}

// Scoped by the rb- prefix so a page's own custom CSS, which targets generic
// classes, cannot reach it. Approved mockup: card-style-v2.html, row 2.
const CSS = `
.rb-card{position:fixed;left:12px;right:12px;z-index:45;display:flex;align-items:center;background:#fff;color:#0b0b0d;
  border:1px solid #ece9e2;border-radius:20px;padding:14px 44px 14px 14px;box-sizing:border-box;
  box-shadow:0 1px 2px rgba(17,50,91,.06),0 22px 44px -18px rgba(17,50,91,.30);
  font:400 14px/1.35 var(--font-body,Inter,system-ui,sans-serif);text-align:left;transition:bottom .2s ease}
@media (min-width:768px){.rb-card{left:24px;right:auto;width:420px;border-radius:22px;padding:18px 44px 18px 18px}}
@media (prefers-reduced-motion:no-preference){.rb-card{animation:rb-rise .6s cubic-bezier(.16,1,.3,1) both}}
@keyframes rb-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.rb-body{display:flex;align-items:center;gap:13px;min-width:0}
@media (min-width:768px){.rb-body{gap:16px}}
.rb-pic{position:relative;flex:none;width:52px;height:52px}
@media (min-width:768px){.rb-pic{width:60px;height:60px}}
.rb-pic img{display:block;width:100%;height:100%;object-fit:cover;border-radius:14px}
.rb-initial{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:#11325b;color:#fff;font-weight:600;font-size:20px}
.rb-check{position:absolute;right:-5px;bottom:-5px;width:22px;height:22px;border-radius:50%;background:#2f8a52;color:#fff;
  border:2.5px solid #fff;box-sizing:border-box;display:grid;place-items:center;font-size:11px;font-weight:700;line-height:1}
.rb-text{min-width:0}
.rb-who{display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;letter-spacing:-.01em}
@media (min-width:768px){.rb-who{font-size:17px}}
.rb-flag{display:inline-block;width:22px;height:16px;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.08);flex:none}
.rb-flag svg{display:block;width:100%;height:100%}
.rb-what{margin-top:2px;color:#5b5b63;font-size:14px;overflow:hidden;text-overflow:ellipsis}
@media (min-width:768px){.rb-what{font-size:15px}}
.rb-what b{color:#0b0b0d;font-weight:600}
.rb-meta{display:flex;align-items:center;gap:8px;margin-top:5px;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
.rb-age{color:#b0532f}.rb-ok{color:#2f8a52}
.rb-dot{width:3px;height:3px;border-radius:50%;background:#cfcbc3}
.rb-close{position:absolute;top:0;right:0;width:44px;height:44px;border:0;background:none;color:#8f8c86;font-size:18px;line-height:1;cursor:pointer;border-radius:0 20px 0 12px}
.rb-close:hover{color:#0b0b0d}
.rb-close:focus-visible{outline:2px solid #11325b;outline-offset:-6px}
`;
