"use client";

import { useEffect, useState } from "react";
import { DeployNoticeBar, type DeployNotice } from "@/components/admin/deploy-notice";

/**
 * Listens for a deploy warning, on every admin page.
 *
 * Polled rather than pushed, for the reason the presence hook gives: this stack
 * has no realtime channel, and one indexed read every ten seconds is cheaper
 * than adding one. Ten rather than the presence hook's twenty, because the
 * whole warning is sixty seconds long — a twenty-second poll could spend a
 * third of it before anyone hears.
 *
 * It keeps polling while the tab is hidden. Somebody who has switched windows
 * mid-edit is exactly the person this exists for, and they should come back to
 * the notice rather than to a failed save.
 *
 * Dismissing is per-notice, not forever: a second announcement raises the bar
 * again, because a second announcement means something changed.
 */
const POLL_MS = 10_000;

export function DeployWatch() {
  const [notice, setNotice] = useState<DeployNotice | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const res = await fetch("/api/deploy-notice", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { notice?: DeployNotice | null };
        if (alive) setNotice(json.notice ?? null);
      } catch {
        // A missed poll is not worth saying anything about. The next one is ten
        // seconds away, and the failure mode is the silence we had before.
      }
    };

    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const showing = notice && notice.startsAt !== dismissed ? notice : null;

  return <DeployNoticeBar notice={showing} onDismiss={() => setDismissed(notice?.startsAt ?? null)} />;
}
