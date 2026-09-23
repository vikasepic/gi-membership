import { stopViewAsAction } from "@/app/(store)/view-as-actions";

/**
 * The strip that says you are not yourself.
 *
 * Deliberately loud and always on top. An admin in this mode can do anything
 * the member can — cancel their subscription, mark their lessons — and every
 * one of those acts is indistinguishable afterwards from the member doing it.
 * The only protection against that is knowing, at a glance and at all times,
 * whose account this is.
 */
export function ViewAsBanner({ name, email }: { name: string | null; email: string | null }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-primary px-4 py-2 text-center text-sm text-primary-fg">
      <span>
        Viewing as <strong>{name || email || "a member"}</strong>
        {name && email ? <span className="opacity-80"> ({email})</span> : null}. Anything you do here
        is recorded as theirs.
      </span>
      <form action={stopViewAsAction}>
        <button className="rounded-full border border-primary-fg/40 px-3 py-0.5 text-xs font-medium hover:bg-primary-fg/10">
          Stop and go back
        </button>
      </form>
    </div>
  );
}
