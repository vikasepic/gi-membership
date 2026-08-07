"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveMyName, type ProfileState } from "@/app/(store)/account/actions";
import { useSlowSave, useJustSaved } from "@/components/admin/save-status";

/**
 * The member's own details.
 *
 * Their name was collected once, at the checkout, and then shown to them never
 * again — so anyone who mistyped it was stuck with it, on this page and in
 * every email we send, with nowhere to go and nothing to click.
 *
 * The email is deliberately read-only. Changing the address on an account is
 * not a text field: it is a confirmation sent to both addresses, and it moves
 * every purchase, entitlement and CRM contact keyed to it. Showing it as an
 * input that silently does nothing would be worse than showing it plainly.
 */
export function YourDetails({ email, fullName }: { email: string; fullName: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(saveMyName, {});
  const justSaved = useJustSaved(state.saved);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <span className="kicker text-muted">Your details</span>

      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Name</span>
          <input
            name="fullName"
            defaultValue={fullName}
            autoComplete="name"
            placeholder="The name we should use"
            className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
          />
        </label>
        <p className="text-xs text-muted">
          Used on your receipts and on anything we email you.
        </p>
        <SaveRow error={state.error} justSaved={justSaved} />
      </form>

      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="text-sm text-muted">Email</span>
        <span className="text-sm">{email}</span>
        <p className="text-xs text-muted">
          Your purchases and access are tied to this address. To change it,{" "}
          {/* A real person, because moving an account between addresses has to
              be checked by someone — every entitlement follows it. */}
          <Link href="/account?billing=none" className="text-primary hover:underline">
            ask us
          </Link>{" "}
          and we will move everything across.
        </p>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="text-sm text-muted">Password</span>
        <p className="text-xs text-muted">
          You can sign in with a link sent to your email, so a password is optional.{" "}
          <Link href="/reset" className="text-primary hover:underline">
            Set one
          </Link>{" "}
          if you would rather type it.
        </p>
      </div>
    </section>
  );
}

function SaveRow({ error, justSaved }: { error?: string; justSaved: boolean }) {
  const { pending } = useFormStatus();
  const slow = useSlowSave(pending);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full border border-border px-5 py-2.5 text-sm transition-colors hover:border-primary disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save name"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-primary">
          {error}
        </span>
      ) : slow ? (
        <span role="status" className="text-xs text-primary">
          Still saving. It may already have worked — reload to check.
        </span>
      ) : justSaved ? (
        <span role="status" className="text-xs text-navy">
          Saved
        </span>
      ) : null}
    </div>
  );
}
