"use client";

import { useEffect, useRef } from "react";
import { track } from "@/components/analytics";
import { eventIdFor, type EventName } from "@/lib/analytics/events";

/**
 * Report that a page or a moment happened, once.
 *
 * A ref rather than an empty dependency array: React runs effects twice in
 * development and a page that re-renders for any reason would otherwise report
 * again. A ViewContent counted twice is a conversion rate halved.
 */
export function TrackView({
  event,
  params = {},
  stableKey,
}: {
  event: EventName;
  params?: Record<string, unknown>;
  /** Something that identifies this occurrence, so the id survives a re-render. */
  stableKey?: string;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(event, params, eventIdFor(event, stableKey));
    // params is deliberately not a dependency: it is an object literal at every
    // call site, so depending on it would fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, stableKey]);
  return null;
}
