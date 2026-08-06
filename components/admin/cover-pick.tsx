"use client";

import { useState } from "react";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { COVER_ASPECT, COVER_RATIO_LABEL, COVER_SIZE_LABEL, coverWarnings } from "@/lib/cover";

/**
 * Choosing a cover.
 *
 * One button, not a file input beside a library button. Uploading and reusing
 * are the same intention — put this picture there — and asking which one first
 * is asking about plumbing. Both live inside the window the button opens.
 *
 * What comes back is a file that already exists, so the form posts an id and
 * nothing is uploaded twice.
 */
export function useCoverPick() {
  const [picked, setPicked] = useState<PickedMedia | null>(null);

  return {
    picked,
    notes: picked?.width && picked?.height ? coverWarnings(picked.width, picked.height) : [],
    onPickExisting: setPicked,
  };
}

/** The button, the rules, and what the choice will look like cropped. */
export function CoverPick({
  picked,
  notes,
  onPickExisting,
  hasCover,
}: {
  picked: PickedMedia | null;
  notes: string[];
  onPickExisting: (item: PickedMedia) => void;
  hasCover: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <MediaButton
        kind="image"
        onPick={onPickExisting}
        label={hasCover ? "Replace image" : "Select image"}
      />

      <span className="text-xs text-muted">
        Best at <b className="font-medium text-fg">{COVER_RATIO_LABEL}</b> — {COVER_SIZE_LABEL}{" "}
        pixels, or any size in that shape. Anything a different shape is cropped from the centre to
        fit.
      </span>

      {picked && (
        <div className="flex flex-wrap items-start gap-3">
          {/* Posted instead of a file. Named `mediaId` in every form that takes
              an image, which is what lets one server-side check cover them all. */}
          <input type="hidden" name="mediaId" value={picked.id} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={picked.url ?? ""}
            alt=""
            className={`${COVER_ASPECT} w-full max-w-56 rounded-lg border border-border object-cover`}
          />
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-muted">{picked.name} — how it will look on the card.</span>
            {notes.map((n) => (
              <span key={n} className="text-primary">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
