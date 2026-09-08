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
const GROUPS = [
  { kind: "product", heading: "Products" },
  { kind: "offer", heading: "Offers" },
] as const;

/** "Offer — Book Writer" -> "Book Writer". The group heading carries the kind. */
function stripKind(label: string): string {
  return label.replace(/^(Product|Offer)\s+—\s+/, "");
}

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="email" type="email" required placeholder="Email" className={input} />
        <input name="fullName" placeholder="Full name (optional)" className={input} />
      </div>

      {/* Checkboxes, not a select. A person can hold any number of products and
          offers — the data model always allowed it — but one <select> could
          only ever say one, so comping somebody two things meant adding them
          and then finding them in the list again.

          There is no "No access yet" option any more: nothing ticked already
          means that, and an entry that duplicates the empty state is only a way
          to get it wrong. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-muted">
          Give access to (optional — tick as many as you like)
        </legend>
        {/* No max-height. Capped, six of eleven showed and the rest needed a
            scrollbar nested inside a form inside a collapsed <details> — three
            scroll contexts to reach one tickbox. The list is short, the form is
            behind a summary, and the page scrolls perfectly well on its own. */}
        <div className="rounded-xl border border-border p-3">
          {GROUPS.map(({ kind, heading }) => {
            const items = grants.filter((g) => g.value.startsWith(`${kind}:`));
            if (items.length === 0) return null;
            return (
              <div key={kind} className="mb-3 flex flex-col gap-1.5 last:mb-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {heading}
                </span>
                {items.map((g) => (
                  <label key={g.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="grant"
                      value={g.value}
                      className="size-4 shrink-0 accent-primary"
                    />
                    {/* The heading says which kind it is, so the label does not
                        repeat it. */}
                    <span>{stripKind(g.label)}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </fieldset>

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
