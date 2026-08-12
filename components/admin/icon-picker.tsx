"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Every Font Awesome free icon, pickable.
 *
 * The whole set is 2,163 icons and 1.7MB of path data, and an icon somebody
 * CHOOSES cannot be tree-shaken — the page has to be able to draw whichever one
 * they picked. So none of it is in the bundle:
 *
 * - the set is a static file, fetched once, only when this picker is opened,
 *   and only ever in the admin;
 * - picking one stores its PATH in the block, so a store page draws it from its
 *   own content with no library, no lookup and no request.
 *
 * `@fortawesome/fontawesome-free` is a devDependency for exactly one reason —
 * `scripts/extract-fa-icons.mjs` reads its metadata — and never reaches a
 * browser.
 */

export type PickedIcon = { v: string; d: string };
type Row = { i: string; l: string; s: string; t: string[]; v: string; d: string };

/** Cached for the session: 1.7MB should be fetched once, not per open. */
let cache: Row[] | null = null;

export function IconPicker({
  value,
  onPick,
  onClear,
}: {
  value?: PickedIcon | null;
  onPick: (icon: PickedIcon) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(cache);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open || rows) return;
    let live = true;
    fetch("/fa-icons.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Row[]) => {
        cache = data;
        if (live) setRows(data);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [open, rows]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    const match = term
      ? rows.filter((r) => r.l.toLowerCase().includes(term) || r.t.some((t) => t.includes(term)))
      : rows;
    // Capped. Two thousand SVGs in one grid is a second of layout every
    // keystroke, and nobody scrolls past the first hundred anyway.
    return match.slice(0, 120);
  }, [rows, q]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors hover:border-primary"
        >
          {value ? (
            <svg viewBox={value.v} aria-hidden className="size-4 fill-current">
              <path d={value.d} />
            </svg>
          ) : null}
          {value ? "Change icon" : "Choose an icon"}
        </button>
        {value && (
          <button type="button" onClick={onClear} className="text-[0.68rem] text-muted hover:text-primary">
            Remove
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 2,000 icons — star, lock, chart…"
            aria-label="Search icons"
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />

          {error && (
            <p className="px-1 py-2 text-[0.68rem] text-primary">
              The icon set could not be loaded. The marks in the list above need no
              network and still work.
            </p>
          )}
          {!rows && !error && <p className="px-1 py-2 text-[0.68rem] text-muted">Loading the set…</p>}

          {rows && (
            <>
              <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
                {shown.map((r) => (
                  <button
                    key={r.i}
                    type="button"
                    title={`${r.l} (${r.s})`}
                    aria-label={r.l}
                    onClick={() => {
                      onPick({ v: r.v, d: r.d });
                      setOpen(false);
                    }}
                    className={`grid aspect-square place-items-center rounded border transition-colors ${
                      value?.d === r.d ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-surface"
                    }`}
                  >
                    <svg viewBox={r.v} aria-hidden className="size-4 fill-current text-fg">
                      <path d={r.d} />
                    </svg>
                  </button>
                ))}
              </div>
              <p className="px-1 text-[0.62rem] text-muted">
                {shown.length === 0
                  ? "Nothing matches that."
                  : `Showing ${shown.length}${shown.length === 120 ? " — keep typing to narrow it" : ""}.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
