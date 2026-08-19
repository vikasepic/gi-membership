"use client";

import { useActionState } from "react";
import { saveSettingsGroup } from "@/app/admin/settings/actions";
import { CheckoutDesignFields } from "@/components/admin/checkout-design-fields";
import type { Settings } from "@/lib/settings-schema";

/**
 * The checkout editor's form, and the checkout beside it.
 *
 * The same server action every other settings group saves through — one group,
 * one write, merged into the stored blob — so this page cannot overwrite a
 * setting it does not show. It is the settings screen's Checkout group, given
 * its own page because that is where somebody goes looking for it.
 *
 * The preview is the live checkout in a frame, not a drawing of one. Nothing
 * here is worth a second renderer that can fall out of step with the page it
 * claims to represent, and the frame reloads on save so the colours you just
 * chose are the ones you are looking at.
 */
export function CheckoutDesignForm({
  settings,
  previewSlug,
}: {
  settings: Settings;
  previewSlug: string | null;
}) {
  const [state, action] = useActionState(saveSettingsGroup, {} as Awaited<ReturnType<typeof saveSettingsGroup>>);
  const errors = state?.group === "checkout" ? (state.errors ?? {}) : {};

  // Re-fetched on every save, so the frame is never showing the colours from
  // before you pressed it. The saved-at stamp is the whole cache key.
  const src = previewSlug
    ? `/checkout-preview?product=${encodeURIComponent(previewSlug)}${state?.saved ? `&t=${state.saved}` : ""}`
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="_group" value="checkout" />
        {/* What this form was rendered from, so the save can tell your change
            apart from somebody else's. Same contract as the settings screen. */}
        <input
          type="hidden"
          name="_baseline"
          value={JSON.stringify({ checkoutDesign: settings.checkoutDesign })}
        />

        {errors._form && (
          <p
            role="alert"
            className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary"
          >
            {errors._form}
          </p>
        )}

        <CheckoutDesignFields value={settings.checkoutDesign} name="checkoutDesign" />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Save
          </button>
          {state?.saved && <span className="text-sm text-muted">Saved</span>}
        </div>
      </form>

      {src ? (
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted">Preview</span>
          {/* The real page, at a phone-ish width so the fold and the stacking
              are visible without a second layout to maintain. */}
          <iframe
            key={src}
            src={src}
            title="Checkout preview"
            className="h-[46rem] w-full rounded-xl border border-border bg-surface"
          />
          <span className="text-xs text-muted">
            The live checkout. Nothing typed into it here can take a payment — but it is the same
            page a buyer gets, so what you approve is what they meet.
          </span>
        </div>
      ) : (
        <p className="rounded-xl border border-border px-4 py-6 text-sm text-muted">
          Publish a product and the live checkout will show up here beside the settings.
        </p>
      )}
    </div>
  );
}
