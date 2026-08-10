/**
 * Copy and paste, across pages and across tabs.
 *
 * Held in localStorage rather than on the server. What is copied is JSON that
 * already lives in the browser — a block, or one section's content — so a round
 * trip would add a table, a route and a failure mode to something that is
 * already in hand. localStorage also survives the navigation between two
 * different pages' editors, which is the entire use: copy on one product,
 * paste on another.
 *
 * The OS clipboard is written too, as text, so a block can be pasted into a
 * message or a file. Reading it back is not attempted: it needs a permission
 * prompt, it can hold anything, and the local copy is already exact.
 */

const KEY = "gi.clipboard.v1";

export type ClipKind = "block" | "section";

export type Clip = {
  kind: ClipKind;
  /** What it was, for the paste button to say so. */
  label: string;
  /** The section key it came from, when it is a section. */
  sectionKey?: string;
  data: unknown;
  copiedAt: number;
};

/** Anything older than this is almost certainly not what you meant to paste. */
const STALE_MS = 24 * 60 * 60 * 1000;

export function copyToClipboard(clip: Omit<Clip, "copiedAt">): void {
  const full: Clip = { ...clip, copiedAt: Date.now() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(full));
    // Same tab does not get a storage event, so paste buttons in this window
    // are told directly.
    window.dispatchEvent(new CustomEvent("gi-clipboard"));
  } catch {
    // A full or disabled localStorage is not worth an error message; the copy
    // simply does not happen and the paste button stays as it was.
  }
  void navigator.clipboard?.writeText(JSON.stringify(full.data, null, 2)).catch(() => {});
}

export function readClipboard(): Clip | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const clip = JSON.parse(raw) as Clip;
    if (!clip || (clip.kind !== "block" && clip.kind !== "section")) return null;
    if (Date.now() - (clip.copiedAt ?? 0) > STALE_MS) return null;
    return clip;
  } catch {
    return null;
  }
}

export function clearClipboard(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("gi-clipboard"));
  } catch {
    /* nothing to clear */
  }
}

/** Subscribe to changes, here and in other tabs. */
export function onClipboardChange(fn: () => void): () => void {
  const storage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", storage);
  window.addEventListener("gi-clipboard", fn);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("gi-clipboard", fn);
  };
}
