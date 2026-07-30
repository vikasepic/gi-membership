"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Errors the callback route bounces back here, in the reader's words.
const CALLBACK_ERRORS: Record<string, string> = {
  wrong_device:
    "That link has to be opened on the device that asked for it. Request a new one here and it will work.",
  link_expired: "That link has expired. Request a new one below.",
  missing_link: "That link was incomplete. Request a new one below.",
};

type Mode = "link" | "password";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackError = params.get("error");
  const next = params.get("next");

  // Magic link first: most people returning to a store have long forgotten
  // whatever password they set at checkout.
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? (CALLBACK_ERRORS[callbackError] ?? callbackError) : null,
  );
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const callback = new URL("/auth/callback", window.location.origin);
    if (next?.startsWith("/")) callback.searchParams.set("next", next);

    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callback.toString(),
        // Logging in must never quietly mint a new account. Someone mistyping
        // their address deserves "no account with that email", not a second
        // empty one that owns nothing they paid for.
        shouldCreateUser: false,
      },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(next?.startsWith("/") ? next : "/library");
    router.refresh();
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-5 py-10">
        <h1 className="text-2xl">Check your email</h1>
        <p className="text-muted">
          If an account exists for <span className="text-fg">{email}</span>, a login link is on its
          way.
        </p>
        <p className="text-sm text-muted">
          Open it on this device — a login link only works in the browser that asked for it.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          className="w-fit text-sm text-primary hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl">Log in</h1>

      <form
        onSubmit={mode === "link" ? sendLink : signInWithPassword}
        className="flex flex-col gap-4"
      >
        <input
          type="email" required placeholder="Email" value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} className={input}
        />
        {mode === "password" && (
          <input
            type="password" required placeholder="Password" value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} className={input}
          />
        )}
        {error && (
          <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
            {error}
          </p>
        )}
        <button
          type="submit" disabled={busy}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {busy
            ? mode === "link"
              ? "Sending…"
              : "Logging in…"
            : mode === "link"
              ? "Email me a login link"
              : "Log in"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "link" ? "password" : "link");
          setError(null);
        }}
        className="w-fit text-sm text-muted hover:text-fg"
      >
        {mode === "link" ? "Use a password instead" : "Email me a login link instead"}
      </button>

      <div className="flex justify-between border-t border-border pt-4 text-sm text-muted">
        {mode === "password" ? (
          <Link href="/reset" className="hover:text-fg">Forgot password?</Link>
        ) : (
          <span />
        )}
        <Link href="/" className="hover:text-fg">Browse the store</Link>
      </div>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";
