"use client";

import { useActionState, useState } from "react";
import { refundOrderAction, type RefundState } from "@/app/admin/orders/actions";
import { inputClass } from "@/components/admin/form-controls";

// A refund moves real money and cannot be undone, so it is deliberately not a
// one-click action: the row shows a link, which opens a confirmation that has to
// be typed. No native confirm() — it is unstyled, easy to dismiss by reflex, and
// says nothing about what is about to happen.
export function RefundButton({
  orderId,
  email,
  amount,
}: {
  orderId: string;
  email: string;
  amount: string;
}) {
  const [state, action, pending] = useActionState<RefundState, FormData>(refundOrderAction, {});
  const [open, setOpen] = useState(false);

  if (state.ok) return <span className="text-sm text-navy">{state.ok}</span>;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-muted hover:text-primary">
        Refund
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-sm text-fg">
        Refund <strong>{amount}</strong> to {email}? This also removes their access.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="confirm"
          placeholder="Type REFUND"
          aria-label="Type REFUND to confirm"
          autoComplete="off"
          className={`${inputClass} w-40`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Refunding…" : "Confirm refund"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-fg">
          Cancel
        </button>
      </div>
      {state.error && <p className="text-sm text-primary">{state.error}</p>}
    </form>
  );
}
