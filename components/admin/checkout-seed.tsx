"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { seedCheckoutAction, type HomeSeedState } from "@/app/admin/pages/actions";

/**
 * "Start from the checkout buyers are seeing."
 *
 * Same idea as the home page's, and the same reason: the live checkout falls
 * back to a built-in layout until a band holds a block, which leaves this
 * editor as two empty boxes beside a working page with no route between them.
 *
 * It cannot overwrite anything — the action skips any band that already holds a
 * block — so it stays offered after the first press, for the band you emptied
 * and want back.
 */
export function CheckoutSeed({ built }: { built: boolean }) {
  const [state, action] = useActionState<HomeSeedState, FormData>(seedCheckoutAction, {});
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
          ? "Refill any empty band from the built-in checkout"
          : "Start from the current checkout"}
    </button>
  );
}
