"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { inputClass as input } from "@/components/admin/form-controls";
import { duplicateAction, type DuplicateState } from "@/app/admin/duplicate-actions";
import { offerKeyProblem } from "@/lib/offer-key";

const NOUN = { product: "product", offer: "offer" } as const;

// What the person needs to know before they click Duplicate: the copy is
// never live the moment it exists. Worded per kind because "draft" is what a
// product editor calls it and "switched off" is what an offer editor calls it
// — saying the wrong one here would read as a typo, not a fact.
const ARRIVES = {
  product: "arrives as a draft",
  offer: "arrives switched off",
} as const;

/**
 * Duplicate this record, from its own editor.
 *
 * Hidden behind a `<details>` for the same reason as `CopyPage`: this is a
 * thing you do once in a while, not a control that should sit open beside the
 * ones you use on every save. Unlike `CopyPage` it does not ask twice —
 * duplicating adds a new record rather than overwriting this one, so there is
 * nothing here that a second click needs to protect against.
 *
 * The key/slug field validates as you type with `offerKeyProblem`, the same
 * function `duplicateAction` checks server-side — see offer-link-form.tsx for
 * the same shape. The rule cannot say one thing in the box and another on
 * submit.
 */
export function DuplicateButton({
  kind,
  id,
  currentKey,
}: {
  kind: "product" | "offer";
  id: string;
  currentKey: string;
}) {
  const [state, action] = useActionState<DuplicateState, FormData>(duplicateAction, {});
  const [draft, setDraft] = useState(`${currentKey}-copy`);

  const problem = offerKeyProblem(draft);

  return (
    <details className="[&[open]>summary>svg]:rotate-90">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-fg hover:text-fg [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" aria-hidden className="size-2.5 fill-current transition-transform">
          <path d="M5 2.5 10.5 8 5 13.5V2.5Z" />
        </svg>
        Duplicate this {NOUN[kind]}
      </summary>

      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input
          name="key"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${input} w-auto min-w-[14rem] py-1.5 text-xs font-mono`}
          spellCheck={false}
          autoComplete="off"
        />
        <Submit disabled={!!problem} />

        {(problem || state.error) && (
          <span role="alert" className="w-full text-xs text-primary">
            {problem ?? state.error}
          </span>
        )}
        <p className="w-full text-[0.66rem] text-muted">
          The copy {ARRIVES[kind]} — nobody sees it until you turn it back on.
        </p>
      </form>
    </details>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary disabled:opacity-40"
    >
      {pending ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
