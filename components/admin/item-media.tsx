"use client";

import { useState } from "react";
import { MediaButton, type PickedMedia } from "@/components/admin/media-modal";
import { CoverPick, useCoverPick } from "@/components/admin/cover-pick";

/**
 * The lesson's cover and its extra downloads, through the media window.
 *
 * Client wrappers because the item editor is a server component and the window
 * is not. They post `mediaId`, which every upload action already understands.
 */

export function ItemCoverPick({ hasCover }: { hasCover: boolean }) {
  const { picked, notes, onPickExisting } = useCoverPick();
  return (
    <>
      <CoverPick
        picked={picked}
        notes={notes}
        onPickExisting={onPickExisting}
        hasCover={hasCover}
      />
      <button
        disabled={!picked}
        className="w-fit rounded-full border border-border px-5 py-2 text-sm transition-colors hover:border-primary disabled:opacity-60"
      >
        Save cover
      </button>
    </>
  );
}

export function ItemFilePick() {
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {picked && <input type="hidden" name="mediaId" value={picked.id} />}
      <MediaButton kind="document" onPick={setPicked} label="Select a file" />
      {picked && <span className="text-xs text-muted">Chosen: {picked.name}</span>}
      <button
        disabled={!picked}
        className="w-fit rounded-full border border-border px-5 py-2 text-sm transition-colors hover:border-primary disabled:opacity-60"
      >
        Add download
      </button>
    </div>
  );
}
