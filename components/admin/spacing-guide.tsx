"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The margin and the padding, drawn where they are.
 *
 * Four numbers in a panel do not tell you which edge moved. Margin pushes the
 * block's neighbours away and padding pushes its own contents in, and from the
 * canvas both look like "a gap appeared somewhere" — so people type into a box,
 * watch something shift, and cannot tell whether they moved the right one.
 *
 * The colours are the browser's own: amber outside the box is margin, green
 * inside it is padding. Anyone who has opened devtools already knows how to
 * read this, and anyone who has not learns it once.
 *
 * Read from the COMPUTED style rather than from the block's props. The props
 * hold a number and a unit; what the page did with them is the thing worth
 * showing, and it is the only version that survives %, rem, and a rule from a
 * skin the block never set.
 *
 * Nothing is drawn when nothing is set — an outline on every selected block,
 * always, is noise you learn to stop seeing.
 */

type Box = { t: number; r: number; b: number; l: number };
type Shot = { top: number; left: number; w: number; h: number; m: Box; p: Box };

const MARGIN = "rgba(246,162,74,0.32)";
const PADDING = "rgba(88,165,92,0.32)";

function read(el: HTMLElement): Shot {
  const cs = getComputedStyle(el);
  const n = (v: string) => Math.max(0, Math.round(parseFloat(v) || 0));
  return {
    // offsetTop/Left is the border box inside the positioned wrapper, so the
    // margin sits outside it — which is exactly the geometry being drawn.
    top: el.offsetTop,
    left: el.offsetLeft,
    w: el.offsetWidth,
    h: el.offsetHeight,
    m: { t: n(cs.marginTop), r: n(cs.marginRight), b: n(cs.marginBottom), l: n(cs.marginLeft) },
    p: { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) },
  };
}

/** A strip, with its size written in it when there is room to read it. */
function Strip({
  color,
  n,
  style,
}: {
  color: string;
  n: number;
  style: React.CSSProperties;
}) {
  if (n <= 0) return null;
  return (
    <div
      aria-hidden
      className="absolute grid place-content-center overflow-hidden text-[0.58rem] font-medium leading-none text-white/90 tabular-nums"
      style={{ background: color, ...style }}
    >
      {n >= 14 ? n : ""}
    </div>
  );
}

export function SpacingGuide({ on, el }: { on: boolean; el: HTMLElement | null }) {
  const [shot, setShot] = useState<Shot | null>(null);
  // The last thing measured, so a re-measure that found nothing new does not
  // set state and start the loop again.
  const last = useRef("");

  useLayoutEffect(() => {
    if (!on || !el) {
      last.current = "";
      if (shot !== null) setShot(null);
      return;
    }
    const measure = () => {
      const next = read(el);
      const key = JSON.stringify(next);
      if (key === last.current) return;
      last.current = key;
      setShot(next);
    };
    measure();
    // Typing in the panel re-renders and re-measures through the effect; this
    // catches what the panel cannot cause — the canvas being dragged to a new
    // width, an image finishing loading, a font swapping in.
    // Guarded: not every environment has one, and a guide is the last thing
    // that should be able to take the whole editor down.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  });

  if (!on || !shot) return null;
  const { top, left, w, h, m, p } = shot;
  if (!m.t && !m.r && !m.b && !m.l && !p.t && !p.r && !p.b && !p.l) return null;

  const midH = Math.max(0, h - p.t - p.b);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]">
      {/* Margin, outside the box. The top and bottom strips run the full width
          including the side margins, so the four read as one frame rather than
          four unrelated bars. */}
      <Strip color={MARGIN} n={m.t} style={{ top: top - m.t, left: left - m.l, width: w + m.l + m.r, height: m.t }} />
      <Strip color={MARGIN} n={m.b} style={{ top: top + h, left: left - m.l, width: w + m.l + m.r, height: m.b }} />
      <Strip color={MARGIN} n={m.l} style={{ top, left: left - m.l, width: m.l, height: h }} />
      <Strip color={MARGIN} n={m.r} style={{ top, left: left + w, width: m.r, height: h }} />

      {/* Padding, inside it. */}
      <Strip color={PADDING} n={p.t} style={{ top, left, width: w, height: p.t }} />
      <Strip color={PADDING} n={p.b} style={{ top: top + h - p.b, left, width: w, height: p.b }} />
      <Strip color={PADDING} n={p.l} style={{ top: top + p.t, left, width: p.l, height: midH }} />
      <Strip color={PADDING} n={p.r} style={{ top: top + p.t, left: left + w - p.r, width: p.r, height: midH }} />
    </div>
  );
}
