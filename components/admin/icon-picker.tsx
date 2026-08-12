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
export type Row = { i: string; l: string; s: string; t: string[]; v: string; d: string };

/** Cached for the session: 1.7MB should be fetched once, not per open. */
let cache: Row[] | null = null;

/** Solid is what people mean by "an icon"; brands are a different question. */
const STYLES = [
  { id: "all", label: "All" },
  { id: "solid", label: "Solid" },
  { id: "regular", label: "Outline" },
  { id: "brands", label: "Brands" },
] as const;

const STYLE_RANK: Record<string, number> = { solid: 0, regular: 1, brands: 2 };

/**
 * How well a row answers the search, lower being better.
 *
 * Without this the grid was `filter` in file order, which is alphabetical — so
 * the first thing anyone saw was 0, 1, 2, 3, and searching "star" put "Star and
 * Crescent" above "Star". A set of 2,163 icons looked like a set of twelve.
 */
export function score(r: Row, q: string): number {
  const l = r.l.toLowerCase();
  const style = STYLE_RANK[r.s] ?? 3;
  if (!q) {
    // No search: the useful shapes first. Digits and single letters are
    // alphabetically first and almost never what someone is looking for.
    const junk = /^[0-9]$|^[a-z]$/.test(l) ? 40 : 0;
    return 100 + junk + style;
  }
  if (l === q) return 0;
  if (l.startsWith(q)) return 10 + style;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(l)) return 20 + style;
  if (l.includes(q)) return 30 + style;
  return 40 + style;
}

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
  const [style, setStyle] = useState<string>("all");
  // Grows as you scroll. The whole set in one grid is 2,163 SVGs and a second
  // of layout per keystroke; a hard cap of 120 was the other extreme and made
  // the library look tiny.
  const [cap, setCap] = useState(200);

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

  const matched = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    const byStyle = style === "all" ? rows : rows.filter((r) => r.s === style);
    const match = term
      ? byStyle.filter((r) => r.l.toLowerCase().includes(term) || r.t.some((t) => t.includes(term)))
      : byStyle;
    return [...match].sort((a, b) => score(a, term) - score(b, term) || a.l.localeCompare(b.l));
  }, [rows, q, style]);

  const shown = useMemo(() => matched.slice(0, cap), [matched, cap]);

  // A new search starts at the top of a fresh page rather than 800 rows deep.
  useEffect(() => setCap(200), [q, style]);

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
            placeholder="Search 2,163 icons — star, lock, chart…"
            aria-label="Search icons"
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />

          <div className="flex flex-wrap gap-1">
            {STYLES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStyle(t.id)}
                aria-pressed={style === t.id}
                className={`rounded-full px-2 py-0.5 text-[0.65rem] transition-colors ${
                  style === t.id
                    ? "bg-primary text-primary-fg"
                    : "border border-border text-muted hover:border-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="px-1 py-2 text-[0.68rem] text-primary">
              The icon set could not be loaded. The marks in the list above need no
              network and still work.
            </p>
          )}
          {!rows && !error && <p className="px-1 py-2 text-[0.68rem] text-muted">Loading the set…</p>}

          {rows && (
            <>
              <div
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
                    setCap((c) => (c < matched.length ? c + 200 : c));
                  }
                }}
                className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto"
              >
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
                {matched.length === 0
                  ? "Nothing matches that."
                  : shown.length < matched.length
                    ? `${shown.length} of ${matched.length} — scroll for more.`
                    : `${matched.length} icon${matched.length === 1 ? "" : "s"}.`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
