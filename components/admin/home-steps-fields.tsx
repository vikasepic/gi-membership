"use client";

import { useState } from "react";
import type { HomeStep } from "@/lib/home-steps-schema";

/**
 * The steps the home page sorts the store into, posted as one JSON field like
 * every other list in this admin.
 *
 * A step's id is made once, when the step is added, and never shown or
 * edited: offers and products point at it, so renaming or reordering a step
 * here moves nothing. Removing one sends whatever was in it to "Everything
 * else" on the home page, which the row says before it goes.
 */

const input =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";

const newId = () => `step-${Math.random().toString(36).slice(2, 8)}`;

export function HomeStepsFields({ steps, name }: { steps: HomeStep[]; name: string }) {
  const [list, setList] = useState<HomeStep[]>(steps);

  const edit = (i: number, patch: Partial<HomeStep>) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[i], next[to]] = [next[to], next[i]];
    setList(next);
  };

  // A step with no name is somebody mid-thought; it is not saved until it has one.
  const saved = list.filter((s) => s.short.trim());

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(saved)} />

      {list.map((s, i) => (
        <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
          <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Step {i + 1}, short name
              <input value={s.short} onChange={(e) => edit(i, { short: e.target.value })} placeholder="Get seen" maxLength={24} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Heading
              <input value={s.title} onChange={(e) => edit(i, { title: e.target.value })} placeholder="Get it seen" maxLength={80} className={input} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">
            One line under it
            <input
              value={s.line}
              onChange={(e) => edit(i, { line: e.target.value })}
              placeholder="Content, hooks and posts that bring the right people to what you sell."
              maxLength={240}
              className={input}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[0.66rem] text-muted">
              The short name is what the staircase at the top of the home page shows.
            </span>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`} className="rounded px-1.5 text-xs text-muted hover:text-fg">
                ↑
              </button>
              <button type="button" onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`} className="rounded px-1.5 text-xs text-muted hover:text-fg">
                ↓
              </button>
              <button
                type="button"
                onClick={() => setList(list.filter((_, j) => j !== i))}
                title="Anything in this step moves to Everything else on the home page."
                className="rounded px-1.5 text-xs text-muted hover:text-primary"
              >
                Remove
              </button>
            </span>
          </div>
        </div>
      ))}

      {list.length < 8 && (
        <button
          type="button"
          onClick={() => setList([...list, { id: newId(), short: "", title: "", line: "" }])}
          className="self-start rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:border-primary hover:text-fg"
        >
          Add a step
        </button>
      )}
    </div>
  );
}
