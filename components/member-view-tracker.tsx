"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Tells the server which page a member is on, once per page.
 *
 * In the store layout, and client-side on purpose: the layout is not
 * re-rendered for a client navigation, so a record written there would see
 * only the first page of a session. The server decides whether anyone is
 * signed in; for a visitor this is one small request that stores nothing.
 */
export function MemberViewTracker() {
  const path = usePathname();
  // Development mounts every effect twice (StrictMode); the ref survives
  // that, so one page is still one row.
  const posted = useRef<string | null>(null);
  useEffect(() => {
    if (!path || posted.current === path) return;
    posted.current = path;
    void fetch("/api/track/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);
  return null;
}
