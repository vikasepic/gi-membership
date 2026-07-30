"use client";

import { useEffect } from "react";
import Link from "next/link";

// Catches anything thrown while rendering a page. This matters more than it
// used to: ownershipFor and the course/offer readers now THROW on a failed
// query rather than returning empty, because silently treating a failure as
// "owns nothing" is how a buyer gets re-offered something they already pay for.
// Failing loudly is only an improvement if the loud failure is survivable, which
// is what this is.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side digest only; the message itself may contain internals, so it
    // is never rendered to the visitor. This is the hook a real error monitor
    // would replace — there isn't one yet.
    console.error("[render error]", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="kicker text-muted">Something broke</span>
      <h1 className="text-3xl leading-tight md:text-4xl text-balance">
        This page didn&rsquo;t load.
      </h1>
      <p className="text-muted text-pretty">
        The problem is on our side, not yours. Nothing you own has been affected, and no payment is
        ever taken by a page that fails to load.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          onClick={reset}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-border px-6 py-3 font-medium transition-colors hover:border-primary"
        >
          Back to the store
        </Link>
      </div>
      {error.digest && (
        // Gives support something to match against the server logs without
        // exposing the underlying message.
        <p className="pt-2 text-xs text-muted">
          Reference: <code>{error.digest}</code>
        </p>
      )}
    </main>
  );
}
