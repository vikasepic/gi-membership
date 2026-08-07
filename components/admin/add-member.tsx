"use client";

import { useSlowSave } from "@/components/admin/save-status";
import { useActionState } from "react";
import { addMemberAction, type MemberActionState } from "@/app/admin/members/actions";
import { inputClass as input } from "@/components/admin/form-controls";

/**
 * Add a member by hand, optionally granting access in the same step.
 *
 * For the cases a checkout cannot cover: comping someone, fixing a purchase
 * that failed to provision, honouring a sale made off-platform, or letting a
 * beta user in. Adding and granting are one form because the common reason to
 * add someone by hand is to give them something, and two screens invites
 * forgetting the second.
 */
export function AddMember({
  grants,
}: {
  grants: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<MemberActionState, FormData>(addMemberAction, {});
  const slow = useSlowSave(pending);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <span className="font-medium">Add a member</span>
        <span className="text-sm text-muted">
          Creates the account and, if you pick something, gives them access immediately. No password
          — they sign in with a magic link, same as a buyer.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="email" type="email" required placeholder="Email" className={input} />
        <input name="fullName" placeholder="Full name (optional)" className={input} />
        <select name="grant" defaultValue="" className={input} aria-label="Grant access to">
          <option value="">No access yet</option>
          {grants.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded-xl border border-navy/30 bg-navy/5 px-4 py-3 text-sm text-navy">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add member"}
      </button>
      {slow && (
        <p className="text-xs text-primary" role="status">
          Still going. It may already have worked — reload to check.
        </p>
      )}
    </form>
  );
}
