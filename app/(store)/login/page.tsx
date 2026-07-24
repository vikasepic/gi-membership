"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/library");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl">Log in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} className={input} />
        <input type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} className={input} />
        {error && <p className="text-sm text-primary">{error}</p>}
        <button type="submit" disabled={busy}
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60">
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <div className="flex justify-between text-sm text-muted">
        <Link href="/reset" className="hover:text-fg">Forgot password?</Link>
        <Link href="/" className="hover:text-fg">Browse the store</Link>
      </div>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";
