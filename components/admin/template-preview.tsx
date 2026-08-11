"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks } from "@/components/page/blocks";
import { bandTheme, normalizeSectionLayout, BAND_WIDTH, type BandTheme } from "@/lib/page-sections";
import { PREVIEW_SCOPE } from "@/lib/site-typography";
import type { Template } from "@/lib/templates/template";

/** Width every preview is rendered at before scaling — the desktop measure. */
const PREVIEW_WIDTH = BAND_WIDTH;

/**
 * A template drawn at full size and scaled down to fit.
 *
 * Its own file because two screens show it: the library popup inside the
 * builder, and the templates screen. One implementation, so a design cannot
 * look like one thing where you pick it and another where you edit it.
 *
 * `height` caps it for a grid; without one it fits the width and takes
 * whatever height the design needs. Scaling by the smaller of the two ratios
 * is the whole point — fitting the width alone is what cropped every design
 * taller than its tile and showed the top of a design instead of the design.
 */
export function TemplatePreview({
  template,
  theme,
  height,
}: {
  template: Template;
  theme: BandTheme;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const outer = box.current;
    const inner = content.current;
    if (!outer || !inner) return;
    const measure = () => setSize({ w: outer.clientWidth, h: inner.scrollHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    measure();
    return () => ro.disconnect();
  }, [template.id]);

  // The band the design was drawn on, so the preview is the design and not the
  // design standing on somebody else's colour.
  const band = template.band;
  const previewTheme = band?.style ? bandTheme(band.style) : theme;
  const layout = normalizeSectionLayout(band?.layout ?? null);
  const pad = {
    paddingTop: layout.pad.t ?? 48,
    paddingRight: layout.pad.r ?? 24,
    paddingBottom: layout.pad.b ?? 48,
    paddingLeft: layout.pad.l ?? 24,
  };

  const byWidth = size.w > 0 ? size.w / PREVIEW_WIDTH : 0;
  const byHeight = height && size.h > 0 ? height / size.h : Infinity;
  const shown = Math.min(byWidth, byHeight);

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden"
      style={{
        height: height ?? (size.h > 0 ? Math.round(size.h * shown) : 240),
        background: band?.color ?? previewTheme.bg,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: PREVIEW_WIDTH, transform: `scale(${shown || 0.0001})` }}
      >
        {/* @container, or every grid inside collapses to one column and the
            design previews as a stacked list — the same fix the editor canvas
            needed. PREVIEW_SCOPE so the store's own type reaches it. */}
        <div
          ref={content}
          className={`${PREVIEW_SCOPE} @container pointer-events-none`}
          style={{ ...pad, color: previewTheme.fg }}
        >
          <Blocks blocks={template.blocks} theme={previewTheme} at="desktop" />
        </div>
      </div>
    </div>
  );
}
