"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // The store's own sign-in link, pointed at the new-password page. Not
    // resetPasswordForEmail: GoTrue's recovery email carries the link that
    // only finishes in the browser that asked for it, and opened anywhere else
    // it left people on "Choose a new password" with no session (17 Nov 2026).
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", "/reset/update");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      // Asking to reset must never mint an account for a mistyped address.
      options: { emailRedirectTo: callback.toString(), shouldCreateUser: false },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl">Reset password</h1>
      {sent ? (
        <p className="text-muted">
          If an account exists for {email}, an email called “Your sign-in link” is on its way. Open it on any device and it will take you straight to choosing a new password.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={input} />
          {error && <p className="text-sm text-primary">{error}</p>}
          <button type="submit" disabled={busy}
            className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <Link href="/login" className="text-sm text-muted hover:text-fg">Back to log in</Link>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";
