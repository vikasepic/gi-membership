"use client";

import { useState, useActionState } from "react";
import { changeEmailAction, type MemberActionState } from "@/app/admin/members/actions";

/**
 * Change a member's email. Two steps, like Delete: the second says what will
 * happen, because it reaches every connected app and emails two inboxes.
 */
export function ChangeEmail({ userId, email }: { userId: string; email: string }) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(changeEmailAction, {});
  const [open, setOpen] = useState(false);

  if (state.message) return <p className="w-full text-xs text-fg">{state.message}</p>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-fg">
        Change email
      </button>
    );
  }

  return (
    <form action={action} className="flex w-full flex-col gap-2 rounded-xl border border-border p-3">
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor="newEmail" className="text-xs text-muted">
        New email for {email}
      </label>
      <input
        id="newEmail"
        name="newEmail"
        type="email"
        required
        autoComplete="off"
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm"
      />
      <p className="text-[0.7rem] text-muted">
        Changes it in place in Grow, every connected app, Stripe and ActiveCampaign. Their access stays as it is.
        Both addresses get an email saying so.
      </p>
      {state.error && <p className="text-xs text-primary">{state.error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Changing…" : "Change email everywhere"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </form>
  );
}
