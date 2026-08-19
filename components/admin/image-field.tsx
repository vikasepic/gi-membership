"use client";

import { useState } from "react";
import { Field } from "@/components/admin/form-controls";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { publicCoverUrl } from "@/lib/media-url";

/**
 * Pick a picture from the library, with the picture shown.
 *
 * Lifted out of the settings screen, which had the only copy. The offer editor
 * had a text box labelled "Image URL" instead — an admin had to go and find a
 * URL, and nothing showed whether what they pasted resolved to anything. Two
 * of the three offers have no image for exactly that reason.
 *
 * Two shapes, because two callers store different things. `path` keeps the
 * storage path, which is what settings has always held; `url` keeps the whole
 * address, which is what offers.image_url has always held and what a template
 * pointing at somebody else's CDN still needs to be able to hold.
 */
export function ImageField({
  name,
  label,
  hint,
  value,
  error,
  stores = "path",
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  error?: string;
  /** What the hidden input carries — a storage path, or a full URL. */
  stores?: "path" | "url";
}) {
  const [path, setPath] = useState(value);
  // The field reads as filled in whether the file is there or not — a path is
  // all it holds — so a picture deleted from the library left the preview a
  // broken glyph, the Remove button still offered, and nothing saying which of
  // the two it was. The <img> failing is the only report of it, and this panel
  // is the one place where somebody can act on the answer.
  const [gone, setGone] = useState(false);
  const choose = (next: string) => {
    setPath(next);
    setGone(false);
  };
  // A stored URL is already the address; a stored path has to be turned into
  // one. Either way the preview shows what the field will actually resolve to.
  const url = stores === "url" ? path || null : publicCoverUrl(path || null);
  return (
    <Field
      label={label}
      hint={hint}
      error={error ?? (gone ? "That file is no longer in the library — choose it again." : undefined)}
    >
      <span className="flex items-center gap-3">
        <input type="hidden" name={name} value={path} />
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 text-[0.6rem] text-muted">
          {url && !gone ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt="" className="size-full object-contain" onError={() => setGone(true)} />
          ) : (
            url ? "gone" : "none"
          )}
        </span>
        <MediaButton
          kind="image"
          onPick={(item: PickedMedia) => choose(stores === "url" ? (item.url ?? publicCoverUrl(item.path) ?? "") : item.path)}
          label={path ? "Replace" : "Choose"}
        />
        {path && (
          <button
            type="button"
            onClick={() => choose("")}
            className="text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
          >
            Remove
          </button>
        )}
      </span>
    </Field>
  );
}
