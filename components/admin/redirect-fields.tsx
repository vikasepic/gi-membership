"use client";

import { useState } from "react";
import { normalizePath, type StoreRedirect } from "@/lib/redirects";

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

const blank = (): StoreRedirect => ({ from: "", to: "", permanent: true });

export function RedirectFields({
  redirects,
  name,
}: {
  redirects: StoreRedirect[];
  name: string;
}) {
  const [list, setList] = useState<StoreRedirect[]>(redirects.length > 0 ? redirects : [blank()]);

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

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(saved)} />

      {list.map((r, i) => {
        const from = normalizePath(r.from);
        // A rule pointing at itself is a loop a browser will follow about
        // twenty times before saying something unhelpful. The matcher refuses
        // it; this says so while it is being typed.
        const loops =
          Boolean(from) && !/^https?:\/\//i.test(r.to.trim()) && normalizePath(r.to) === from;
        return (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <label className="flex flex-col gap-1 text-xs text-muted">
                From
                <input
                  value={r.from}
                  onChange={(e) => edit(i, { from: e.target.value })}
                  placeholder="/o/funnel-app"
                  className={input}
                />
                {/* What it will actually match, once the slashes and the case
                    have been settled. Shown only when it differs, so the common
                    case stays quiet. */}
                {from && from !== r.from.trim() && (
                  <span className="text-[0.66rem]">matches {from}</span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                To
                <input
                  value={r.to}
                  onChange={(e) => edit(i, { to: e.target.value })}
                  placeholder="/p/funnel-app  —  or a full https:// address"
                  className={input}
                />
                {loops && <span className="text-[0.66rem] text-primary">This points at itself.</span>}
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={r.permanent}
                  onChange={(e) => edit(i, { permanent: e.target.checked })}
                  className="size-3.5"
                />
                Permanent
              </label>
              <span className="text-[0.66rem] text-muted">
                {r.permanent
                  ? "308 — tells Google to move its index across. For a page that has really moved."
                  : "307 — for something coming back. A permanent one is cached by browsers for ever."}
              </span>
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
          First match wins, so a specific rule can be moved above a broader one. Only rules with
          both halves filled in are saved.
        </span>
      </div>
    </div>
  );
}
