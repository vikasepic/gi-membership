"use client";

import { COVER_ASPECT } from "@/lib/cover";
import { CoverPick, useCoverPick } from "@/components/admin/cover-pick";
import { useActionState } from "react";
import { uploadProductCoverAction, clearProductCoverAction, type CoverState } from "@/app/admin/actions";
import { Section } from "@/components/admin/form-controls";

// Optional per-product storefront image. Separate from the product form on
// purpose: it uploads immediately rather than waiting for a save, so it can't be
// lost if the form is later abandoned — the same reason the asset uploader and
// the course cover work this way.
export function ProductCover({
  productId,
  coverUrl,
  inheritedUrl,
}: {
  productId: string;
  /** This product's own cover, if it has one. */
  coverUrl: string | null;
  /** What it would fall back to — the attached course's cover. */
  inheritedUrl: string | null;
}) {
  const [state, action, pending] = useActionState<CoverState, FormData>(uploadProductCoverAction, {});
  const { picked, notes, onPickExisting } = useCoverPick();
  const shown = coverUrl ?? inheritedUrl;

  return (
    <Section
      title="Storefront image"
      hint="What buyers see on the catalog card and the product page. Leave this empty to use the attached course's cover — which is usually what you want for a single-course product."
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        {shown ? (
          <div className="flex flex-col gap-1">
            {/* 16:10 matches the catalog card, so this is the real crop, not a
                guess. self-start stops the flex column stretching its width. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown}
              alt=""
              className={`${COVER_ASPECT} w-full max-w-56 self-start rounded-lg border border-border object-cover`}
            />
            <span className="text-xs text-muted">
              {coverUrl ? "This product's own image." : "Inherited from the attached course."}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No image yet — neither this product nor its course has one, so the card shows a plain
            gradient.
          </p>
        )}

        <form
          action={action}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="productId" value={productId} />
          <CoverPick
            picked={picked}
            notes={notes}
            onPickExisting={onPickExisting}
            hasCover={Boolean(coverUrl)}
          />
          {state.error && <p className="text-sm text-primary">{state.error}</p>}
          {state.ok && <p className="text-sm text-navy">Image updated.</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || !picked}
              className="w-fit rounded-full border border-border bg-surface px-5 py-2 text-sm font-medium transition-colors hover:border-primary disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save image"}
            </button>
            {coverUrl && (
              <button
                type="submit"
                formAction={clearProductCoverAction}
                formNoValidate
                className="text-sm text-muted hover:text-primary"
              >
                Remove, use the course&rsquo;s
              </button>
            )}
          </div>
        </form>
      </div>
    </Section>
  );
}
