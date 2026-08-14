"use client";

import { useEffect, useRef } from "react";
import { track } from "@/components/analytics";
import type { EventName } from "@/lib/analytics/events";

/**
 * Reporting a decision made by a form that navigates away.
 *
 * The upsell's accept is a server action, so pressing it submits and leaves.
 * There is no React handler to hang an event on without moving the form, the
 * token and the action into a client component — and the money path staying
 * server-side is the point of how that page is built.
 *
 * So this is a marker that finds its own form and listens for the submit. It
 * renders nothing.
 *
 * The event is sent synchronously on `submit`, before navigation begins. Both
 * fbq and gtag queue into an image or a beacon that survives the page going
 * away; neither needs to await anything, and neither may be allowed to delay a
 * purchase if it does.
 */
export function TrackChoiceOnSubmit({
  event,
  /**
   * What each answer is worth, keyed by the value of the `choice` input.
   *
   * A form with no `choice` input at all is the single-price accept, and uses
   * the entry under "0" — the same option the server resolves it to.
   */
  options,
  params,
}: {
  event: EventName;
  options: Record<string, { name: string; valueCents: number }>;
  params?: Record<string, unknown>;
}) {
  const mark = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = mark.current?.closest("form");
    if (!form) return;
    const onSubmit = () => {
      const picked =
        form.querySelector<HTMLInputElement>('input[name="choice"]:checked') ??
        form.querySelector<HTMLInputElement>('input[name="choice"]');
      const key = picked?.value ?? "0";
      const option = options[key] ?? options["0"];
      if (!option) return;
      track(event, {
        ...params,
        content_name: option.name,
        value: option.valueCents / 100,
        variant: key,
      });
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [event, options, params]);

  return <span ref={mark} hidden aria-hidden />;
}

/**
 * The same, for declining — a plain link rather than a form.
 *
 * Wraps rather than replaces the link, so the anchor keeps its href and stays a
 * real link: middle-click, open-in-new-tab and a crawler all still work, and
 * the event is a side effect of the click rather than a condition of it.
 */
export function TrackClick({
  event,
  params,
  children,
}: {
  event: EventName;
  params?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <span className="contents" onClick={() => track(event, params ?? {})}>
      {children}
    </span>
  );
}
