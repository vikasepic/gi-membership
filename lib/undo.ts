/**
 * Undo and redo for the builder.
 *
 * Kept as pure functions over a value so the rules can be tested without a
 * browser. The rules are the whole point — a history that records every
 * keystroke as its own step makes Ctrl+Z useless, and one that records too
 * little loses work.
 */

export type History<T> = {
  past: T[];
  future: T[];
  /**
   * What produced the last entry, and when.
   *
   * Consecutive changes from the same source inside the window are one step:
   * dragging a size slider is one thing you did, not forty. A different source
   * — adding a block, moving one — always starts a new step, however fast it
   * follows, because those are separate acts.
   */
  lastKey: string | null;
  lastAt: number;
};

/** How long the same source keeps folding into one step. */
export const COALESCE_MS = 700;

/** Deeper than anyone reaches, shallow enough not to hold a page open forever. */
export const HISTORY_LIMIT = 100;

export const emptyHistory = <T,>(): History<T> => ({
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
});

/**
 * Record a change that is about to happen.
 *
 * `current` is the state BEFORE it — that is what undo goes back to. Any new
 * change clears the redo stack: once you have gone a different way, the branch
 * you left is not somewhere you can step forward into.
 */
export function record<T>(h: History<T>, current: T, key: string | null, now: number): History<T> {
  const same = key !== null && key === h.lastKey && now - h.lastAt < COALESCE_MS;
  const past = same ? h.past : [...h.past, current].slice(-HISTORY_LIMIT);
  return { past, future: [], lastKey: key, lastAt: now };
}

export type Step<T> = { history: History<T>; value: T } | null;

export function undo<T>(h: History<T>, current: T): Step<T> {
  if (h.past.length === 0) return null;
  return {
    value: h.past[h.past.length - 1],
    history: {
      past: h.past.slice(0, -1),
      future: [...h.future, current],
      // An undo ends the run being coalesced, or the next edit would fold into
      // the step you just took back.
      lastKey: null,
      lastAt: 0,
    },
  };
}

export function redo<T>(h: History<T>, current: T): Step<T> {
  if (h.future.length === 0) return null;
  return {
    value: h.future[h.future.length - 1],
    history: {
      past: [...h.past, current],
      future: h.future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
    },
  };
}

/**
 * Whether a keystroke means undo, redo, or nothing.
 *
 * Cmd on a Mac, Ctrl elsewhere, plus Ctrl+Y which is what Windows hands
 * reach for. Returns null while the caret is in a field: the browser's own
 * undo is what someone typing into a text box expects, and taking it away to
 * revert the whole page instead is worse than not having a shortcut at all.
 */
export function undoIntent(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target?: EventTarget | null;
}): "undo" | "redo" | null {
  if (!e.metaKey && !e.ctrlKey) return null;
  if (isTyping(e.target)) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  // Ctrl+Y is redo on Windows. Cmd+Y is Safari's history window, so it is left
  // alone on a Mac.
  if (key === "y" && e.ctrlKey && !e.metaKey) return "redo";
  return null;
}

function isTyping(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object" || !("tagName" in target)) return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = String(el.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}
