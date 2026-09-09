"use client";

import { useRef, useState, type FormEvent } from "react";
import { callApi } from "@/lib/builtin-apps/client";
import type {
  GenerationRecord,
  GenerationResult,
  HookFormat,
} from "@/lib/builtin-apps/hook-generator/types";
import { HookCard } from "./HookCard";

const ERROR_MESSAGES: Record<string, string> = {
  no_access: "Your access to this app is not active. If you just bought it, give it a moment and reload.",
  unauthorized: "You are signed out. Sign in again to continue.",
  busy_try_again: "The generator is busy right now. Try again in a minute.",
  generation_failed: "Generation failed. Nothing was saved. Try again.",
  network_error: "Could not reach the server. Check your connection and try again.",
  ai_auth_failed: "The server's model key was rejected. Tell support.",
  ai_request_rejected: "The model rejected the request. Tell support.",
  ai_unreachable: "Could not reach the model. Try again in a moment.",
  server_misconfigured: "The server is missing its model key. Tell support.",
  post_idea_too_long: "Keep the post idea under 1,500 characters.",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * The generator: a post idea in, six hooks out, and a history of past runs.
 * History arrives from the page on the server and grows here as runs finish.
 */
export function Generator({ initialHistory }: { initialHistory: GenerationRecord[] }) {
  const [postIdea, setPostIdea] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [format, setFormat] = useState<HookFormat>("carousel");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  // Set when the shown result was loaded from history (holds that post idea).
  const [viewingPastIdea, setViewingPastIdea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [history, setHistory] = useState<GenerationRecord[]>(initialHistory);
  const resultsRef = useRef<HTMLElement | null>(null);

  const scrollToResults = () => {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setAllCopied(false);
    scrollToResults();
    const { data, errorCode } = await callApi<{
      result: GenerationResult;
      record: GenerationRecord | null;
    }>("/api/hook-generator/generate", { post_idea: postIdea, niche, audience, tone, format });
    if (errorCode || !data?.result) {
      setError(ERROR_MESSAGES[errorCode ?? "generation_failed"] ?? ERROR_MESSAGES.generation_failed);
    } else {
      setResult(data.result);
      setViewingPastIdea(null);
      if (data.record) setHistory((prev) => [data.record!, ...prev].slice(0, 20));
      scrollToResults();
    }
    setGenerating(false);
  };

  const openPastGeneration = (g: GenerationRecord) => {
    setResult(g.hooks);
    setViewingPastIdea(g.post_idea);
    setAllCopied(false);
    setError(null);
    scrollToResults();
  };

  const copyAll = async () => {
    if (!result) return;
    try {
      const text = result.hooks.map((h, i) => `${i + 1}. ${h.hook}`).join("\n\n");
      await navigator.clipboard.writeText(text);
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1500);
    } catch {
      /* clipboard unavailable, nothing to do */
    }
  };

  const field = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";
  const label = "text-[11px] font-medium uppercase tracking-[0.14em] text-muted";

  return (
    <>
      <form onSubmit={generate} className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="font-display text-2xl font-semibold text-navy sm:text-3xl">
          What&rsquo;s the post about?
        </h1>
        <textarea
          required
          maxLength={1500}
          rows={3}
          value={postIdea}
          onChange={(e) => setPostIdea(e.target.value)}
          aria-label="Your post idea"
          placeholder="e.g. Most new coaches undercharge because they price from fear. How I doubled my rate and lost zero clients"
          className="mt-4 w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 text-base"
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Niche (optional)</span>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={200} placeholder="business coaching" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Audience (optional)</span>
            <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="first-year coaches" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Tone (optional)</span>
            <input value={tone} onChange={(e) => setTone(e.target.value)} maxLength={200} placeholder="blunt, warm, contrarian" className={field} />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex overflow-hidden rounded-full border border-border" role="group" aria-label="Post format">
            {(["carousel", "reel"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  format === f ? "bg-navy text-white" : "bg-surface text-muted hover:text-fg"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={generating || !postIdea.trim()}
            className="flex items-center gap-2.5 rounded-full bg-primary px-6 py-3 font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {generating && (
              <span className="spinner h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
            )}
            {generating ? "Writing your hooks" : "Generate 6 hooks"}
          </button>
          {generating && <span className="text-xs text-muted">usually 20 to 40 seconds</span>}
        </div>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Results (or generating skeleton) */}
      <section ref={resultsRef} className="scroll-mt-6">
        {generating && (
          <div className="mt-12">
            <div className="h-6 w-44 animate-pulse rounded-lg bg-border" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                  <div className="aspect-[4/5] animate-pulse bg-navy/10" style={{ animationDelay: `${i * 180}ms` }} />
                  <div className="space-y-2.5 p-4">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-border" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-border" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && !generating && (
          <div className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-navy">
                  {viewingPastIdea ? "From your history" : "Your 6 hooks"}
                </h2>
                {viewingPastIdea && (
                  <p className="mt-1 max-w-xl truncate text-sm text-muted">&ldquo;{viewingPastIdea}&rdquo;</p>
                )}
                {result.assumed_audience && (
                  <p className="mt-1 text-xs text-muted">assumed audience: {result.assumed_audience}</p>
                )}
              </div>
              <button
                onClick={copyAll}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold transition-colors hover:bg-navy hover:text-white"
              >
                {allCopied ? "Copied" : "Copy all"}
              </button>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {result.hooks.map((h, i) => (
                <HookCard key={i} hook={h} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-navy">Past generations</h2>
            <span className="text-xs text-muted">click one to view its hooks</span>
          </div>
          <ul className="mt-5 grid gap-3">
            {history.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => openPastGeneration(g)}
                  className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{g.post_idea}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-navy">{g.format}</span>
                      <span>{g.hooks?.hooks?.length ?? 6} hooks</span>
                      <span aria-hidden>&middot;</span>
                      <span>{formatDate(g.created_at)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-navy transition-transform group-hover:translate-x-0.5">
                    View &rarr;
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
