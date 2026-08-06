"use client";

import { useState } from "react";

/**
 * A destructive submit that asks first.
 *
 * Two clicks and no native confirm(): a browser dialog is unstyled, easy to
 * dismiss by reflex, and gives nothing to read. The second button states what
 * is about to happen, which is the part worth pausing on — and it goes back to
 * asking if you click anywhere else, so a half-pressed delete does not sit
 * there armed.
 *
 * It stays a real submit button with its own formAction, so the server action
 * and its guards are untouched. This only decides whether the click reaches it.
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  formAction,
  className = "text-sm text-muted hover:text-primary",
}: {
  label: string;
  /** What the second click will do, said plainly. */
  confirmLabel: string;
  formAction: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={className}>
        {label}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-sm text-muted hover:text-fg"
      >
        Keep it
      </button>
      <button
        type="submit"
        formAction={formAction}
        data-action="delete"
        className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
      >
        {confirmLabel}
      </button>
    </span>
  );
}
