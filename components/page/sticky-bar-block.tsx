"use client";

import { useEffect, useState } from "react";
import { readableInk } from "@/lib/color";

/**
 * The bar that follows the page down.
 *
 * One button, and it scrolls rather than buys. That is the whole design: a bar
 * that tries to take money has to know which price was chosen, and a bar
 * quoting a price the page above it does not is the page disagreeing with
 * itself while somebody decides to spend. Sending them to the choice is
 * unambiguous, and it is one tap either way.
 *
 * It hides until the target has been scrolled past, so it is not sitting over
 * the offer while somebody is still reading it — a bar covering the thing it
 * points at is worse than no bar.
 */
export function StickyBarBlock({
  text,
  buttonLabel,
  scrollTo,
  position,
  priceLine,
  background,
  textColor,
  buttonBg,
  buttonColor,
  buttonRadius,
  band,
}: {
  text: string;
  buttonLabel: string;
  /** A CSS id, or blank to find the first Ways to pay block on the page. */
  scrollTo: string;
  position: "top" | "bottom";
  priceLine: string | null;
  background: string | null;
  textColor: string | null;
  buttonBg: string | null;
  buttonColor: string | null;
  buttonRadius: number;
  band: { fg: string; panel: string; rule: string; accent: string };
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Named first, then the choice, then the first thing that buys. The last
    // of those is what makes a blank field work on a page that has no Ways to
    // pay block on it — which is most pages, and the call to action is the
    // thing a bar like this has always meant.
    const target = () =>
      (scrollTo.trim() ? document.getElementById(scrollTo.trim()) : null) ??
      document.querySelector<HTMLElement>("[data-ways-to-pay]") ??
      document.querySelector<HTMLElement>("[data-buy]");
    const check = () => {
      const el = target();
      if (!el) {
        // Nothing to point at — better to show nothing than a button that
        // does nothing when pressed.
        setShow(false);
        return;
      }
      const box = el.getBoundingClientRect();
      // Once the choice has left the screen upwards, or has not arrived yet.
      setShow(box.bottom < 0 || box.top > window.innerHeight);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [scrollTo]);

  const bg = background || band.panel;
  const fill = buttonBg || band.accent;

  return (
    <div
      className={`fixed inset-x-0 z-40 transition-transform duration-200 ${
        position === "top" ? "top-0" : "bottom-0"
      } ${show ? "translate-y-0" : position === "top" ? "-translate-y-full" : "translate-y-full"}`}
      style={{ background: bg, borderTop: position === "bottom" ? `1px solid ${band.rule}` : undefined }}
    >
      <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-sm" style={{ color: textColor || band.fg }}>
          {text.trim() || priceLine || ""}
        </span>
        <button
          type="button"
          onClick={() => {
            const el =
              (scrollTo.trim() ? document.getElementById(scrollTo.trim()) : null) ??
              document.querySelector<HTMLElement>("[data-ways-to-pay]") ??
              document.querySelector<HTMLElement>("[data-buy]");
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            // Focus the first radio once it is in view, so the keyboard and a
            // screen reader arrive where the eye does.
            window.setTimeout(
              () => el?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus(),
              600,
            );
          }}
          className="shrink-0 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            background: fill,
            color: buttonColor || readableInk(fill),
            borderRadius: buttonRadius,
          }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
