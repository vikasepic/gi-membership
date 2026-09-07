"use client";

import { useActionState, useState } from "react";
import { saveOfferKey, type KeyState } from "@/app/admin/offers/actions";
import { inputClass } from "@/components/admin/form-controls";
import { offerKeyProblem } from "@/lib/offer-key";

/**
 * The offer's public address, as something you can change.
 *
 * It used to be read-only text with Copy and Open beside it, which read as
 * "this is fixed" — the editable field lived on a different screen, under a
 * different name, and nobody found it. The address is shown where it is
 * changed.
 *
 * The warning is not fine print. Nothing redirects from an old key, so saving
 * this kills every link already published — an ad, an email, a DM — and there
 * is no way to tell afterwards which ones there were.
 */
export function OfferLinkForm({
  offerId,
  offerKey,
  siteUrl,
}: {
  offerId: string;
  offerKey: string;
  siteUrl: string;
}) {
  const [state, action, pending] = useActionState<KeyState, FormData>(saveOfferKey, {});
  const [draft, setDraft] = useState(offerKey);

  // Checked as they type with the same function the server uses, so the rule
  // cannot say one thing here and another on submit.
  const problem = draft === offerKey ? null : offerKeyProblem(draft);
  const changed = draft.trim() !== offerKey && draft.trim() !== "";

  return (
    <form action={action} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
      <input type="hidden" name="id" value={offerId} />
      <label className="text-sm font-medium" htmlFor="offer-key">
        Public link
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted">{siteUrl}/o/</span>
        <input
          id="offer-key"
          name="key"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${inputClass} flex-1 font-mono`}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={pending || !changed || !!problem}
          className="rounded-xl border border-border px-4 py-2.5 text-sm disabled:opacity-40"
        >
          {pending ? "Changing…" : "Change link"}
        </button>
      </div>

      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.saved ? <p className="text-sm text-muted">Link is now /o/{state.saved}</p> : null}

      <p className="text-sm text-muted">
        Changing this <span className="font-medium text-fg">breaks the old address immediately</span> — anything
        already pointing at it stops working, and nothing redirects. Settle it before the link goes into an ad.
      </p>
    </form>
  );
}
