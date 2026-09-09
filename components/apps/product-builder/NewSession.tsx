"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/builtin-apps/product-builder/client";
import { INTAKE_LIMITS } from "@/lib/builtin-apps/product-builder/stages";
import type { SessionRecord } from "@/lib/builtin-apps/product-builder/types";

const ERRORS: Record<string, string> = {
  no_access: "Your access to this app is not active. If you just bought it, give it a moment and reload.",
  unauthorized: "You are signed out. Sign in again to continue.",
  server_misconfigured: "The server is missing its model key. Tell support.",
};

/** Three quick answers so the coach can skip the warm up. */
export function NewSession({ appRoute }: { appRoute: string }) {
  const router = useRouter();
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  const [last, setLast] = useState("");
  const [quick, setQuick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!who.trim() || !what.trim()) return;
    setBusy(true);
    setError(null);
    const { data, errorCode } = await callApi<{ session: SessionRecord }>(
      "/api/product-builder/sessions",
      { who, what, last, quick },
    );
    if (errorCode || !data?.session) {
      setError(ERRORS[errorCode ?? ""] ?? "Could not start a session. Try again.");
      setBusy(false);
      return;
    }
    router.push(`${appRoute}/${data.session.id}`);
  };

  const field =
    "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed placeholder:text-muted";

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-navy">Start a new product</h1>
      <p className="mt-2 text-muted">
        Three quick answers so the coach can skip the warm up. Rough is fine; narrowing is the
        coach&rsquo;s job.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <label className="block">
          <span className="text-sm font-medium text-fg/85">Who do you help?</span>
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            maxLength={INTAKE_LIMITS.who}
            required
            placeholder="Freelance designers, first time landlords, new team leads"
            className={`${field} mt-1.5`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fg/85">What do you help them with?</span>
          <input
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            maxLength={INTAKE_LIMITS.what}
            required
            placeholder="Getting a quiet client to sign the proposal they already sent"
            className={`${field} mt-1.5`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fg/85">
            The last person you helped with this, in a sentence
          </span>
          <span className="ml-2 text-xs text-muted">optional</span>
          <textarea
            value={last}
            onChange={(e) => setLast(e.target.value)}
            maxLength={INTAKE_LIMITS.last}
            rows={3}
            placeholder="Dev runs a coffee roastery. His rebrand proposal went quiet, and two weeks after we spoke it was signed."
            className={`${field} mt-1.5 resize-y`}
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-fg/85">Pace</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <PaceOption
              checked={!quick}
              onSelect={() => setQuick(false)}
              title="Thorough"
              body="About a dozen answers. The coach digs for the details that make the guide yours."
            />
            <PaceOption
              checked={quick}
              onSelect={() => setQuick(true)}
              title="Quick"
              body="About six answers. The coach fills the gaps itself and marks every guess for you to fix later."
            />
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={busy || !who.trim() || !what.trim()}
            className="rounded-full bg-primary px-7 py-3 font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Opening" : "Start with the coach"}
          </button>
          <Link href={appRoute} className="text-sm text-muted underline underline-offset-4 hover:text-fg">
            Back to your sessions
          </Link>
        </div>
      </form>
    </div>
  );
}

function PaceOption({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
        checked ? "border-navy bg-surface shadow-sm" : "border-border bg-surface/60 hover:border-navy/40"
      }`}
    >
      <input type="radio" name="pace" checked={checked} onChange={onSelect} className="mt-1 accent-primary" />
      <span>
        <span className="block font-semibold text-navy">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-fg/70">{body}</span>
      </span>
    </label>
  );
}
