"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Reached from the reset email's link, which signs the person in on the way
// here (app/auth/callback), so updateUser has a session to set the password on.
// Someone who arrives any other way has none: they are told to ask for the
// email rather than shown GoTrue's "Auth session missing!".
export default function ResetUpdatePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsLink, setNeedsLink] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setNeedsLink(/session/i.test(error.message));
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/library");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl">Choose a new password</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="password" required minLength={8} placeholder="New password (min 8 chars)"
          value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        {error && !needsLink && <p className="text-sm text-primary">{error}</p>}
        {needsLink && (
          <p className="text-sm text-primary">
            This page needs the link from your email. <Link href="/reset" className="underline">Ask for a new one</Link> and open it; it brings you back here signed in.
          </p>
        )}
        <button type="submit" disabled={busy}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60">
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";
