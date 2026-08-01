"use client";

import { useState } from "react";
import { useActionState } from "react";
import { deleteMemberAction, type MemberActionState } from "@/app/admin/members/actions";

/**
 * Delete a member, with the reason it might not be allowed shown before the
 * click rather than after it.
 *
 * Two clicks, no browser confirm dialog: a native confirm() is easy to dismiss
 * by reflex and gives nothing to read. The second button states what will
 * happen, which is the part worth pausing on.
 *
 * The server re-checks every rule here. This is the explanation; the action is
 * the enforcement.
 */
export function DeleteMember({
  userId,
  email,
  orders,
  isOwner,
  isSelf,
}: {
  userId: string;
  email: string;
  orders: number;
  isOwner: boolean;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(
    deleteMemberAction,
    {},
  );
  const [armed, setArmed] = useState(false);

  // Deleting a buyer would orphan their payments — orders survive with no
  // customer attached, and that link is what a refund or chargeback needs.
  const blocked = isOwner
    ? "Owner account"
    : isSelf
      ? "This is you"
      : orders > 0
        ? `Has ${orders} order${orders === 1 ? "" : "s"}`
        : null;

  if (blocked) {
    return (
      <span
        className="text-xs text-muted"
        title={
          orders > 0 && !isOwner && !isSelf
            ? "Deleting them would leave those payments with no customer attached. Revoke their access instead."
            : undefined
        }
      >
        {blocked}
      </span>
    );
  }

  if (state.error) {
    return <span className="text-xs text-primary">{state.error}</span>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="rounded-full border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-xs text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete for good"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-xs text-muted hover:text-fg"
      >
        Cancel
      </button>
    </form>
  );
}
