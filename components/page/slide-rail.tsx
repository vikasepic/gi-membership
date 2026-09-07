"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The rail a set of slides scrolls on, and the controls that say so.
 *
 * The strip itself was already a scroll-snap list: it swipes on touch, scrolls
 * with a trackpad and moves with the keyboard, and it needs no JavaScript. What
 * it had no way of saying was that it scrolls at all. On a desktop with no
 * touch and a hidden scrollbar, three slides that happen to fit look like three
 * cards, and the fourth is a secret. `arrows` and `dots` had been props since
 * the block was written and nothing read them.
 *
 * So this is added ON TOP rather than replacing anything. The list is passed in
 * as children and still renders on the server; without JavaScript it behaves
 * exactly as it did. The arrows, the dots and the fade only appear once this
 * mounts, and they are all `aria-hidden` or properly labelled — the slides are
 * already reachable by keyboard through the scroll container itself.
 */
export function SlideRail({
  children,
  arrows,
  dots,
  count,
  perView,
  accent,
  ink,
  arrowStyle = "solid",
  arrowColor = "",
  arrowSize = null,
  arrowPrevImage = "",
  arrowNextImage = "",
}: {
  children: React.ReactNode;
  arrows: boolean;
  dots: boolean;
  /** How many slides there are, for the dots. */
  count: number;
  /** How many are on screen, so the dots count pages rather than slides. */
  perView: number;
  accent: string;
  ink: string;
  /** The shape of the two arrows. "solid" is the circle they have always been. */
  arrowStyle?: ArrowStyle;
  /** Empty is the band's accent, which is what they have always been painted in. */
  arrowColor?: string;
  /** Null is the `size-9` they have always carried. */
  arrowSize?: number | null;
  /** Already resolved to a URL by the renderer — this side never touches storage. */
  arrowPrevImage?: string;
  arrowNextImage?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  // The scrolling element is the list passed in as children, not this wrapper.
  // Holding a ref to the wrapper and scrolling THAT moves nothing, silently.
  const scroller = () => wrap.current?.querySelector<HTMLElement>("ul") ?? null;
  const [page, setPage] = useState(0);
  const [ends, setEnds] = useState({ start: true, end: false });
  // Nothing is drawn until this mounts, so a page with JavaScript off looks
  // exactly as it did rather than showing arrows that cannot move anything.
  const [ready, setReady] = useState(false);

  const pages = Math.max(1, Math.ceil(count / Math.max(1, perView)));

  const measure = useCallback(() => {
    const el = wrap.current?.querySelector<HTMLElement>("ul");
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEnds({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 });
    // Which page is showing, from position rather than from a counter — a
    // counter goes wrong the moment somebody swipes instead of pressing.
    setPage(max <= 0 ? 0 : Math.round((el.scrollLeft / max) * (pages - 1)));
  }, [pages]);

  useEffect(() => {
    setReady(true);
    measure();
    const el = wrap.current?.querySelector<HTMLElement>("ul");
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    // Guarded, not assumed. A runtime without ResizeObserver would throw here
    // and take the whole block out — and one such runtime is the test
    // environment, which is how this was noticed. The window listener is the
    // fallback and is enough: what changes the rail's width is the viewport.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    if (!ro) window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
      if (!ro) window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const go = (dir: -1 | 1) => {
    const el = scroller();
    if (!el) return;
    // By a viewport, not by a fixed number of pixels: the slide width is a
    // percentage of the rail and changes with the breakpoint.
    el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  const toPage = (i: number) => {
    const el = scroller();
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: pages <= 1 ? 0 : (max * i) / (pages - 1), behavior: "smooth" });
  };

  // One page of slides is not a slider. Drawing arrows that cannot move and
  // one dot that means nothing is worse than drawing neither.
  const scrollable = ready && count > perView;

  return (
    <div className="relative">
      <div ref={wrap}>{children}</div>

      {scrollable && arrows && (
        <>
          <RailButton
            side="left"
            disabled={ends.start}
            accent={accent}
            ink={ink}
            shape={arrowStyle}
            color={arrowColor}
            size={arrowSize}
            image={arrowPrevImage}
            onClick={() => go(-1)}
          />
          <RailButton
            side="right"
            disabled={ends.end}
            accent={accent}
            ink={ink}
            shape={arrowStyle}
            color={arrowColor}
            size={arrowSize}
            image={arrowNextImage}
            onClick={() => go(1)}
          />
        </>
      )}

      {scrollable && dots && (
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1} of ${pages}`}
              aria-current={i === page ? "true" : undefined}
              onClick={() => toPage(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === page ? 20 : 6,
                background: accent,
                opacity: i === page ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export type ArrowStyle = "solid" | "bare" | "outline";

/** The box the arrow is drawn in when nobody has said otherwise — `size-9`. */
const ARROW_BOX = 36;
/** The chevron inside that box when nobody has said otherwise — `size-4`. */
const ARROW_GLYPH = 16;

function RailButton({
  side,
  disabled,
  accent,
  ink,
  shape,
  color,
  size,
  image,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  accent: string;
  ink: string;
  shape: ArrowStyle;
  color: string;
  size: number | null;
  image: string;
  onClick: () => void;
}) {
  // Painted from the band, so it reads on paper and on navy without a second
  // set of colours to keep in step. A colour of its own overrides that.
  const tint = color || accent;
  // An uploaded picture IS the arrow: a custom graphic sitting inside the
  // accent circle would be two arrows on top of each other, so the chrome goes
  // with the chevron it replaces. The other side is untouched and keeps
  // whatever the shape says.
  const bare = shape === "bare" || !!image;
  // The class stays when nothing is set, so a slider saved before these
  // controls existed renders the identical button — which the golden test
  // checks byte for byte.
  const box = size == null ? "size-9 " : "";
  const px = size ?? ARROW_BOX;
  // A bare chevron has no circle to sit inside, so the box IS the chevron.
  // Inside a circle it keeps the 16-in-36 proportion it has always had.
  const glyph = bare ? px : Math.round((px * ARROW_GLYPH) / ARROW_BOX);
  const glyphClass = size == null && !bare ? "size-4 " : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous slides" : "Next slides"}
      className={`absolute top-1/2 z-10 grid ${box}-translate-y-1/2 place-items-center ${
        bare ? "" : "rounded-full shadow-md "
      }transition-opacity disabled:opacity-0 ${side === "left" ? "-left-2 md:-left-4" : "-right-2 md:-right-4"}`}
      style={{
        ...(bare
          ? { color: tint }
          : shape === "outline"
            ? { border: `1px solid ${tint}`, color: tint }
            : { background: tint, color: ink }),
        ...(size == null ? {} : { width: px, height: px }),
      }}
    >
      {image ? (
        // Empty alt: decoration beside a button that already carries the label.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" style={{ width: glyph, height: glyph, objectFit: "contain" }} />
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`${glyphClass}fill-current`}
          {...(glyphClass ? {} : { style: { width: glyph, height: glyph } })}
        >
          <path d={side === "left" ? "M15.4 4.6 7 13l8.4 8.4 1.4-1.4L9.8 13l7-7-1.4-1.4Z" : "M8.6 4.6 7.2 6l7 7-7 7 1.4 1.4L17 13 8.6 4.6Z"} />
        </svg>
      )}
    </button>
  );
}
