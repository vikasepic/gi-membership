"use client";

import { useState } from "react";
import { MediaPicker, type PickedMedia } from "@/components/admin/media-picker";
import { COVER_ASPECT, COVER_MAX, COVER_RATIO_LABEL, COVER_SIZE_LABEL, coverWarnings, mb } from "@/lib/cover";

/**
 * Choosing a cover, with the answer to "what size should this be?" on screen.
 *
 * Both places that take a cover — the product's own image and the course's —
 * ask the same question and crop to the same shape, so they share the check.
 * A filename says nothing about dimensions, so the file is measured here in the
 * browser and drawn at the ratio it will really be cropped to. Wrong-shaped is
 * a warning, never a refusal: nobody should be stopped from shipping a product
 * over forty pixels.
 */
export function useCoverPick() {
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  // Set when they chose one the store already has. The form posts this instead
  // of a file, and nothing is uploaded twice.
  const [picked, setPicked] = useState<PickedMedia | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Choosing a new file abandons the library choice — the last thing they did
    // is what they meant.
    setPicked(null);
    setTooBig(
      f && f.size > COVER_MAX
        ? `That image is ${mb(f.size)}. Covers must be under ${mb(COVER_MAX)}.`
        : null,
    );
    setNotes([]);
    const url = f ? URL.createObjectURL(f) : null;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
    if (!url) return;
    const img = new Image();
    img.onload = () => setNotes(coverWarnings(img.naturalWidth, img.naturalHeight));
    img.src = url;
  }

  /** They chose one from the library instead. */
  function onPickExisting(item: PickedMedia) {
    setPicked(item);
    setTooBig(null);
    setPreview(item.url);
    setNotes(
      item.width && item.height ? coverWarnings(item.width, item.height) : [],
    );
  }

  return { tooBig, notes, preview, picked, onPick, onPickExisting };
}

/** The library, offering images only. */
export function CoverLibrary({ onPickExisting }: { onPickExisting: (item: PickedMedia) => void }) {
  return <MediaPicker kind="image" onPick={onPickExisting} label="Or choose one you already have" />;
}

export function CoverHint() {
  return (
    <span className="text-xs text-muted">
      Best at <b className="font-medium text-fg">{COVER_RATIO_LABEL}</b> — {COVER_SIZE_LABEL} pixels,
      or any size in that shape. Anything a different shape is cropped from the centre to fit. JPG,
      PNG or WebP up to {mb(COVER_MAX)}; it is resized for the web on upload, so a large photo is
      fine.
    </span>
  );
}

/** The chosen file at the ratio it will be cropped to, plus what is off about it. */
export function CoverPreview({
  preview,
  notes,
  picked,
}: {
  preview: string | null;
  notes: string[];
  picked?: PickedMedia | null;
}) {
  if (!preview) return null;
  return (
    <div className="flex flex-wrap items-start gap-3">
      {/* Posted instead of a file. Named `mediaId` in every form that takes a
          cover, which is what lets one server-side check cover all of them. */}
      {picked && <input type="hidden" name="mediaId" value={picked.id} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview}
        alt=""
        className={`${COVER_ASPECT} w-full max-w-56 rounded-lg border border-border object-cover`}
      />
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-muted">
          {picked ? `${picked.name} — already in your library.` : "How it will appear on the card."}
        </span>
        {notes.map((n) => (
          <span key={n} className="text-primary">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
