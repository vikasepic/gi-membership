"use client";

import { useState } from "react";
import { DeployNoticeBar, type DeployNotice } from "@/components/admin/deploy-notice";

/**
 * A button that raises the notice, so it can be watched.
 *
 * The seconds are adjustable because the argument is really about the number.
 * Sixty is the agreed one: long enough to press Save on anything open, short
 * enough that whoever is pushing will actually wait it out every time — and a
 * rule nobody keeps is worse than no rule.
 */
export function DeployNoticePreview() {
  const [notice, setNotice] = useState<DeployNotice | null>(null);
  const [seconds, setSeconds] = useState(60);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Warning time
          <span className="flex items-center gap-2">
            <input
              type="range"
              min={10}
              max={120}
              step={5}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
            <span className="w-12 tabular-nums text-fg">{seconds}s</span>
          </span>
        </label>

        <button
          type="button"
          onClick={() =>
            setNotice({
              startsAt: new Date(Date.now() + seconds * 1000).toISOString(),
              backInMinutes: 5,
            })
          }
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Announce a deploy
        </button>

        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-fg hover:text-fg"
          >
            Reset
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        Watch the bottom of the screen. It counts down, then changes to the after-message on its
        own — that second state is what somebody sees if they were away from the keyboard for the
        whole warning.
      </p>

      <DeployNoticeBar notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
