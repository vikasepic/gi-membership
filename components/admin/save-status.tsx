"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A save that has been going too long to still be believed.
 *
 * "Saving…" with nothing after it is the worst state a button can be in: it
 * says something is happening, gives no way to tell whether it still is, and
 * offers nothing to do about it. After a few seconds this turns the silence
 * into a sentence.
 *
 * It deliberately does not cancel or retry. A server action that has not come
 * back may still be writing, and a retry on top of it is a second write of the
 * same thing — the honest thing to say is "it may have worked, go and look".
 */
export function useSlowSave(pending: boolean, afterMs = 8000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [pending, afterMs]);
  return slow;
}

/**
 * Whether the last save worked, for a moment.
 *
 * A tick that stays forever stops meaning "just now". This clears itself, so
 * seeing it always means the save you are thinking of.
 */
export function useJustSaved(saved: boolean | undefined, forMs = 4000): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!saved) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), forMs);
    return () => clearTimeout(t);
  }, [saved, forMs]);
  return shown;
}

/** The one line beside a Save button that says where things stand. */
export function SaveStatus({
  pending,
  slow,
  justSaved,
  problem,
  dirty,
}: {
  pending: boolean;
  slow: boolean;
  justSaved: boolean;
  /** What is wrong, in words. Outranks everything else. */
  problem?: string | null;
  dirty: boolean;
}) {
  if (problem) {
    return (
      <span className="text-xs text-primary" role="alert">
        {problem}
      </span>
    );
  }
  if (slow) {
    return (
      <span className="text-xs text-primary" role="status">
        Still saving. It may already have worked — reload to check.
      </span>
    );
  }
  if (pending) {
    return (
      <span className="text-xs text-muted" role="status">
        Saving…
      </span>
    );
  }
  if (justSaved) {
    return (
      <span className="text-xs text-navy" role="status">
        Saved
      </span>
    );
  }
  return dirty ? <span className="text-xs text-primary">Unsaved</span> : null;
}

/**
 * A submit button that says what it is doing, for a plain server-action form.
 *
 * `useFormStatus` reads the enclosing form, so this works without the parent
 * holding any state — which is what let several forms ship with a button that
 * looked identical before, during and after a save.
 */
export function SubmitButton({
  children,
  busyLabel = "Saving…",
  className = "rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60",
}: {
  children: React.ReactNode;
  busyLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const slow = useSlowSave(pending);
  return (
    <span className="flex items-center gap-3">
      <button type="submit" disabled={pending} className={className}>
        {pending ? busyLabel : children}
      </button>
      {slow && (
        <span className="text-xs text-primary" role="status">
          Still going. It may already have worked — reload to check.
        </span>
      )}
    </span>
  );
}
