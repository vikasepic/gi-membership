"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { seedHomeAction, type HomeSeedState } from "@/app/admin/pages/actions";

/**
 * "Start from the page the store is showing."
 *
 * The storefront falls back to a built-in page until a band has something in
 * it, which is safe and leaves this editor as four empty boxes — a blank canvas
 * where a working page is, with no route between them except retyping it.
 *
 * It cannot overwrite anything: the action skips any band that already holds a
 * block and says which ones it skipped. So this is offered even after the page
 * has been built, because the useful case is not only the first press — it is
 * the band you emptied and want back.
 */
export function HomeSeed({ built }: { built: boolean }) {
  const [state, action] = useActionState<HomeSeedState, FormData>(seedHomeAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button built={built} />
      {state.message && (
        <span role="status" className="text-xs text-muted">
          {state.message}
        </span>
      )}
      {state.error && (
        <span role="alert" className="text-xs text-primary">
          {state.error}
        </span>
      )}
    </form>
  );
}

function Button({ built }: { built: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-lg border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-fg disabled:opacity-60"
    >
      {pending
        ? "Filling the bands…"
        : built
          ? "Refill any empty band from the built-in page"
          : "Start from the page the store is showing"}
    </button>
  );
}
