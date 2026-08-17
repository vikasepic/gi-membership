"use client";

import { useState, type ReactNode } from "react";

/**
 * The selling panel, folded up on a phone.
 *
 * On a laptop the panel is a column beside the form and costs nothing to
 * read. On a phone it is a screen and a half ABOVE the first field — an image,
 * a paragraph and five bullets that a buyer has already read on the page they
 * came from, standing between them and the thing they came to do. So on a
 * phone it collapses to what somebody actually needs to confirm they are in
 * the right place: what it is, and what it costs.
 *
 * `contents` rather than a second copy of the markup. The wrapper vanishes
 * from the layout when open, so its children join the panel's own flex flow
 * and take their place in it by `order` — which is what lets the image sit
 * above the title on a laptop and inside the fold on a phone without the
 * title existing twice in the page.
 *
 * Never collapsed on a laptop: `lg:contents` wins over the closed state, so
 * the toggle is a phone control and the desktop panel is untouched by it.
 */
export function StageBody({
  summary,
  details,
  moreLabel,
}: {
  /** Always visible: the eyebrow, the name, the price. */
  summary: ReactNode;
  /** Folded on a phone: the image, the description, the bullets. */
  details: ReactNode;
  /** What the closed control offers — "What's included", "See the details". */
  moreLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ml-auto flex w-full max-w-[30rem] flex-col gap-4 lg:gap-5">
      {summary}

      <div className={`${open ? "contents" : "hidden"} lg:contents`}>{details}</div>

      {/* Phone only, and last in the panel — it is the way further in, not a
          heading for what is above it. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="order-last flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[#f3ede6]/20 px-3.5 py-2.5 text-left text-[#e7eaef] transition-colors hover:border-[#f3ede6]/35 lg:hidden"
        style={{ fontSize: "0.8rem" }}
      >
        <span className="font-medium">{open ? "Hide the details" : moreLabel}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`size-4 shrink-0 fill-none stroke-current transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.2}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
