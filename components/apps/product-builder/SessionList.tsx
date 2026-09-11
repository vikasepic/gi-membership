"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { STAGE_LABELS } from "@/lib/builtin-apps/product-builder/stages";
import { shortDate, dateWithYear } from "@/lib/dates";
import type { SessionRecord } from "@/lib/builtin-apps/product-builder/types";

// Same-year sessions drop the year; the UTC comparison keeps that decision
// pinned the same way the date itself is, so nobody near a year boundary in
// one zone sees a session unexpectedly grow or lose its year.
function formatDate(iso: string): string {
  const sameYear = new Date(iso).getUTCFullYear() === new Date().getUTCFullYear();
  return sameYear ? shortDate(iso) : dateWithYear(iso);
}

/**
 * The member's sessions, newest first. Loaded by the page on the server;
 * deletion goes through a server action that checks ownership again.
 */
export function SessionList({
  sessions: initial,
  appRoute,
  onDelete,
}: {
  sessions: SessionRecord[];
  appRoute: string;
  onDelete: (sessionId: string) => Promise<{ ok: boolean }>;
}) {
  const [sessions, setSessions] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = (s: SessionRecord) => {
    if (!window.confirm(`Delete "${s.title}"? This removes the conversation and any built guide.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const { ok } = await onDelete(s.id);
      if (ok) setSessions((prev) => prev.filter((x) => x.id !== s.id));
      else setError("That session could not be deleted. Reload and try again.");
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-navy">Your sessions</h1>
          <p className="mt-2 text-muted">
            Each session is one product. Start a new one whenever you have a new problem to build
            around.
          </p>
        </div>
        <Link
          href={`${appRoute}/new`}
          className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Start a new session
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {sessions.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-navy/20 bg-surface/60 p-10 text-center">
          <p className="font-display text-2xl text-navy">Nothing here yet.</p>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Your first session takes about fifteen minutes of talking. The coach opens with one
            question: who do you help, and what do you help them with.
          </p>
          <Link
            href={`${appRoute}/new`}
            className="mt-6 inline-block rounded-full bg-navy px-6 py-3 font-semibold text-white transition-colors hover:bg-navy/90"
          >
            Start your first session
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-3">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-navy/30"
            >
              <Link href={`${appRoute}/${s.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium text-fg">{s.title}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {s.quick && (
                    <span className="rounded-full bg-navy/10 px-2 py-0.5 font-medium text-navy">
                      Quick
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      s.stage === "READY" || s.stage === "GATE"
                        ? "bg-primary/10 text-primary"
                        : s.stage === "STOP"
                          ? "bg-navy/10 text-navy"
                          : "bg-plum/10 text-plum"
                    }`}
                  >
                    {STAGE_LABELS[s.stage]}
                  </span>
                  <span>{formatDate(s.updated_at)}</span>
                </span>
              </Link>
              <button
                onClick={() => remove(s)}
                disabled={pending}
                className="text-xs text-muted transition-colors hover:text-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
