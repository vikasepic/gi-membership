"use client";

import { useState } from "react";
import { normalizePath, redirectSchema, traceRedirect, validateRules, type StoreRedirect } from "@/lib/redirects";

/**
 * Old addresses, and where they go now.
 *
 * A list posted as one JSON field, the same as every other list in this admin.
 *
 * The panel does the normalising in front of you rather than silently on save:
 * people type `Products/Old-Thing/`, `/products/old-thing` and the whole URL
 * from the browser bar, all meaning the same rule, and a field that accepts all
 * three and matches only one is a rule that looks configured and does nothing.
 */

const input =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

const blank = (): StoreRedirect => redirectSchema.parse({});

const select =
  "rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary";

/** What the test box says for one address, run against the rules on screen, saved or not. */
function testResult(list: StoreRedirect[], address: string): string | null {
  if (!address.trim()) return null;
  const t = traceRedirect(list, address);
  if (t.protectedPath) return "Never redirected: admin, checkout or members' area.";
  if (t.steps.length === 0) return "No rule catches this address.";
  const chain = t.steps.map((s) => `Rule ${s.ruleIndex + 1} → ${s.location}`).join(" → ");
  return t.loop ? `${chain} → … goes round in a circle.` : chain;
}

export function RedirectFields({
  redirects,
  name,
}: {
  redirects: StoreRedirect[];
  name: string;
}) {
  const [list, setList] = useState<StoreRedirect[]>(redirects.length > 0 ? redirects : [blank()]);
  const [probe, setProbe] = useState("");

  const edit = (i: number, patch: Partial<StoreRedirect>) =>
    setList(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[i], next[to]] = [next[to], next[i]];
    setList(next);
  };

  // Only rules with both halves are saved. A half-typed row is somebody
  // mid-thought, not a rule they want applied to the live site.
  const saved = list.filter((r) => r.from.trim() && r.to.trim());
  // The same checks the save runs, shown under each rule while it is typed.
  const problems = new Map(validateRules(list).map((p) => [p.index, p.message]));
  const result = testResult(list, probe);

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(saved)} />

      {list.map((r, i) => {
        const n = i + 1;
        const from = r.match === "exact" ? normalizePath(r.from) : "";
        return (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Name
              <input
                aria-label={`Name, rule ${n}`}
                value={r.name}
                onChange={(e) => edit(i, { name: e.target.value })}
                placeholder="Optional, for this list only"
                className={input}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <label className="flex flex-col gap-1 text-xs text-muted">
                From
                <input
                  aria-label={`From, rule ${n}`}
                  value={r.from}
                  onChange={(e) => edit(i, { from: e.target.value })}
                  placeholder={r.match === "pattern" ? "^/blog/(.*)$" : "/o/funnel-app"}
                  className={input}
                />
                {/* What an exact rule will actually match, once the slashes
                    and the case are settled. Shown only when it differs. */}
                {from && from !== r.from.trim() && <span className="text-[0.66rem]">matches {from}</span>}
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                To
                <input
                  aria-label={`To, rule ${n}`}
                  value={r.to}
                  onChange={(e) => edit(i, { to: e.target.value })}
                  placeholder={r.match === "pattern" ? "https://example.com/news/$1" : "/p/funnel-app, or a full https:// address"}
                  className={input}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                Match
                <select
                  aria-label={`Match, rule ${n}`}
                  value={r.match}
                  onChange={(e) => edit(i, { match: e.target.value as StoreRedirect["match"] })}
                  className={select}
                >
                  <option value="exact">Exact address</option>
                  <option value="pattern">Pattern ($1 to $9)</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Type
                <select
                  aria-label={`Type, rule ${n}`}
                  value={r.permanent ? "301" : "302"}
                  onChange={(e) => edit(i, { permanent: e.target.value === "301" })}
                  className={select}
                >
                  <option value="301">301 Permanent</option>
                  <option value="302">302 Temporary</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Query string
                <select
                  aria-label={`Query string, rule ${n}`}
                  value={r.query}
                  onChange={(e) => edit(i, { query: e.target.value as StoreRedirect["query"] })}
                  className={select}
                >
                  <option value="keep">Keep</option>
                  <option value="drop">Drop</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  aria-label={`On, rule ${n}`}
                  checked={r.enabled}
                  onChange={(e) => edit(i, { enabled: e.target.checked })}
                  className="size-3.5"
                />
                On
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" onClick={() => move(i, -1)} className="rounded px-1.5 text-xs text-muted hover:text-fg">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} className="rounded px-1.5 text-xs text-muted hover:text-fg">
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setList(list.length === 1 ? [blank()] : list.filter((_, j) => j !== i))}
                  className="rounded px-1.5 text-xs text-muted hover:text-primary"
                >
                  Remove
                </button>
              </span>
            </div>
            <span className="text-[0.66rem] text-muted">
              {r.permanent
                ? "301 tells Google the page has moved for good. A browser remembers it."
                : "302 is for something coming back, like a campaign. Nothing is remembered."}
            </span>
            {problems.has(i) && <span className="text-[0.7rem] text-primary">{problems.get(i)}</span>}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setList([...list, blank()])}
          className="w-fit rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
        >
          Add a redirect
        </button>
        <span className="text-[0.66rem] text-muted">
          First match wins, so a specific rule can sit above a broader one. Admin, sign-in, checkout,
          account, library and apps are never redirected.
        </span>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Test an address
        <input
          aria-label="Test an address"
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
          placeholder="/o/foundation-weekend?utm_source=meta"
          className={input}
        />
        {result && <span className="text-[0.75rem] text-fg">{result}</span>}
      </label>
    </div>
  );
}
