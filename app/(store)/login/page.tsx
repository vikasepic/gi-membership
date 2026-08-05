"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, isPasswordError } from "@/lib/auth-errors";
import { Logo } from "@/components/logo";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

// Errors the callback route bounces back here, in the reader's words.
const CALLBACK_ERRORS: Record<string, string> = {
  wrong_device:
    "That link has to be opened on the device that asked for it. Request a new one here and it will work.",
  link_expired: "That link has expired. Request a new one below.",
  missing_link: "That link was incomplete. Request a new one below.",
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackError = params.get("error");
  const next = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? (CALLBACK_ERRORS[callbackError] ?? callbackError) : null,
  );
  const [busy, setBusy] = useState<"link" | "password" | null>(null);
  // Hidden by default. Almost everyone here has no password — they buy, then
  // sign in with a link — so a password box on arrival asks the majority for
  // something they do not have and never set.
  const [showPassword, setShowPassword] = useState(false);

  async function sendLink() {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setBusy("link");
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
    if (error) setError(authErrorMessage(error.message, email));
    else setSent(true);
    setBusy(null);
  }

  async function signInWithPassword() {
    setBusy("password");
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(authErrorMessage(error.message, email));
      // Keep the field open on a password failure — collapsing it under the
      // error that is about it would hide the thing they need to retype.
      if (isPasswordError(error.message)) setShowPassword(true);
      setBusy(null);
      return;
    }
    router.push(next?.startsWith("/") ? next : "/library");
    router.refresh();
  }

  // One submit path, chosen by what they actually filled in, so Enter does the
  // right thing whether or not the password field is open.
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim()) void signInWithPassword();
    else void sendLink();
  }

  if (sent) {
    return (
      <Shell>
        <div className="flex flex-col gap-5">
          <span className="kicker text-primary">Check your email</span>
          <h1 className="text-3xl leading-tight">A login link is on its way</h1>
          <p className="text-muted">
            If an account exists for <span className="text-fg">{email}</span>, the link is in your
            inbox. It expires shortly, so use it soon.
          </p>
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            Open it on <span className="text-fg">this device</span> — a login link only works in the
            browser that asked for it.
          </p>
          <div className="flex flex-wrap items-center gap-5 pt-1">
            <button
              onClick={() => {
                setSent(false);
                setError(null);
              }}
              className="text-sm text-primary hover:underline"
            >
              Use a different email
            </button>
            <Link href="/" className="text-sm text-muted hover:text-fg">
              Browse the store
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl leading-tight">Welcome back</h1>
          <p className="text-muted">
            Your courses and apps are waiting. We&rsquo;ll email you a link — no password needed.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-1">
          <label className="flex flex-col gap-1.5">
            <span className="kicker text-muted">Email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>

          {showPassword ? (
            <label className="flex flex-col gap-1.5">
              <span className="kicker flex items-center justify-between text-muted">
                Password
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword(false);
                    setPassword("");
                  }}
                  className="normal-case tracking-normal text-primary hover:underline"
                >
                  Use a link instead
                </button>
              </span>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowPassword(true)}
              className="w-fit text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            >
              I have a password
            </button>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary"
          >
            {error}
          </p>
        )}

        {/* The label follows what they have typed, so the button always states
            what it is about to do rather than making them infer it. */}
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-full bg-primary px-6 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {busy === "password"
            ? "Logging in…"
            : busy === "link"
              ? "Sending your link…"
              : password.trim()
                ? "Log in"
                : "Email me a login link"}
        </button>

        <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-muted">
          {showPassword ? (
            <Link href="/reset" className="hover:text-fg">
              Forgot your password?
            </Link>
          ) : (
            <span />
          )}
          <Link href="/" className="hover:text-fg">
            Browse the store
          </Link>
        </div>
      </form>
    </Shell>
  );
}

// Two columns on desktop, form first on mobile. The left panel is not
// decoration: a single field floating on a wide monitor reads as an unfinished
// page, and this is the first thing a returning customer sees.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 py-8 md:grid-cols-12 md:gap-16 md:py-16">
      <div className="order-2 flex flex-col gap-6 md:order-1 md:col-span-5">
        <Logo className="h-7 w-auto text-fg" />
        <p className="text-lg text-muted">
          Everything you&rsquo;ve bought stays in one place — your courses to read, and Content
          Engine to open in a click.
        </p>
        <ul className="flex flex-col gap-2.5 text-sm">
          {[
            "No password needed — a link signs you straight in",
            "Your library keeps everything you own",
            "Manage billing and cancel any time",
          ].map((line) => (
            <li key={line} className="flex items-start gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="text-muted">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="order-1 md:order-2 md:col-span-7">
        <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8 md:p-10">
          {children}
        </div>
      </div>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";
